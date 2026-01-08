import {
  Task,
  TaskStatus,
  AgentRole
} from '@opensourcewtf/waaah-types';
import type { Database } from 'better-sqlite3';
import type { ITaskQueue, AckResult, QueueStats, HistoryOptions, WaitResult } from './queue.interface.js';
import { TypedEventEmitter } from './queue-events.js';
import { TaskRepository, type ITaskRepository } from './task-repository.js';

const ACK_TIMEOUT_MS = 30000;         // 30s to ACK a task before it's requeued
const SCHEDULER_INTERVAL_MS = 10000;  // Run scheduler every 10s
const ORPHAN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes offline = orphan

/**
 * Manages the global task queue, handling task lifecycle, assignment, and persistence.
 * 
 * Architecture:
 * - Uses TaskRepository as SINGLE SOURCE OF TRUTH for task data
 * - Uses TypedEventEmitter for type-safe events
 * - In-memory state: only pendingAcks (ACK timeouts) and waitingAgents (polling)
 * 
 * @implements {ITaskQueue}
 */
export class TaskQueue extends TypedEventEmitter implements ITaskQueue {
  /** Repository for task persistence operations */
  private readonly repo: ITaskRepository;

  /** Pending ACK tracking: taskId -> { agentId, sentAt } */
  private pendingAcks: Map<string, { taskId: string; agentId: string; sentAt: number }> = new Map();

  /** Agents currently waiting for tasks: agentId -> role */
  private waitingAgents: Map<string, AgentRole> = new Map();

  private schedulerInterval: NodeJS.Timeout | null = null;

  /**
   * Create a new TaskQueue instance.
   * @param databaseOrRepo - Database instance or TaskRepository (REQUIRED - no default to prevent production leaks)
   */
  constructor(databaseOrRepo: Database | ITaskRepository) {
    super();

    // Accept either a Database or a TaskRepository
    if ('insert' in databaseOrRepo) {
      this.repo = databaseOrRepo as ITaskRepository;
    } else {
      this.repo = new TaskRepository(databaseOrRepo as Database);
    }

    // Reset any PENDING_ACK tasks from previous run to QUEUED
    this.resetStaleAcks();
    // Scheduler is started explicitly by server.ts
  }

  /** Reset PENDING_ACK tasks to QUEUED (agent connections are gone after restart) */
  private resetStaleAcks(): void {
    try {
      const stale = this.repo.getByStatus('PENDING_ACK');
      for (const task of stale) {
        console.log(`[Queue] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.repo.updateStatus(task.id, 'QUEUED');
      }
      console.log(`[Queue] Loaded ${this.repo.getActive().length} active tasks from DB`);
    } catch {
      // Database may not be initialized yet (tests)
      console.log('[Queue] Database not ready, skipping stale ACK reset');
    }
  }

  /**
   * Enqueues a new task into the system.
   * Persists the task to the database and emits an event for waiting agents.
   * 
   * @param task - The task object to enqueue.
   */
  enqueue(task: Task): void {
    // Check dependencies before enqueueing
    if (task.dependencies && task.dependencies.length > 0) {
      const allMet = task.dependencies.every(depId => {
        const dep = this.getTask(depId) || this.getTaskFromDB(depId);
        return dep && dep.status === 'COMPLETED';
      });

      if (!allMet) {
        task.status = 'BLOCKED';
        console.log(`[Queue] Task ${task.id} BLOCKED by dependencies: ${task.dependencies.join(', ')}`);
      }
    }



    try {
      this.repo.insert(task);
      console.log(`[Queue] Enqueued task: ${task.id} (${task.status})`);

      // ATOMIC ASSIGNMENT: Find and reserve agent synchronously
      // Note: findAndReserveAgent emits the 'task' event internally when a match is found
      const reservedAgentId = this.findAndReserveAgent(task);

      if (reservedAgentId) {
        console.log(`[Queue] ✓ Task ${task.id} reserved for agent ${reservedAgentId}`);
        // Don't emit here - findAndReserveAgent already emitted to the agent
      } else {
        console.log(`[Queue] No waiting agents for task ${task.id}. Task remains QUEUED.`);
        // Don't emit - scheduler will handle it later when agents connect
      }
    } catch (e: any) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e.message}`);
    }
  }

  /**
   * Adds a message to a task thread.
   */
  addMessage(taskId: string, role: 'user' | 'agent' | 'system', content: string, metadata?: Record<string, unknown>): void {
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    try {
      this.repo.addMessage(taskId, role, content, metadata);
      console.log(`[Queue] Added message to task ${taskId} from ${role}`);

      // Update in-memory task if present
      const task = this.repo.getById(taskId);
      if (task) {
        if (!task.messages) task.messages = [];
        task.messages.push({ id, taskId, role, content, timestamp, metadata });
      }
    } catch (e: any) {
      console.error(`[Queue] Failed to add message to task ${taskId}: ${e.message}`);
    }
  }

  /**
   * Gets message history for a task.
   */
  getMessages(taskId: string): any[] {
    try {
      return this.repo.getMessages(taskId);
    } catch (e: any) {
      console.error(`[Queue] Failed to get messages for task ${taskId}: ${e.message}`);
      return [];
    }
  }

  /**
   * Retrieves current queue statistics.
   * 
   * @returns An object containing the total count of tasks and the count of completed tasks.
   */
  getStats(): { total: number, completed: number } {
    try {
      return this.repo.getStats();
    } catch (e) {
      console.error("Failed to get queue stats", e);
      return { total: 0, completed: 0 };
    }
  }

  // Find a task for a specific agent based on ID or Role
  // Default timeout: 290s (Antigravity has 300s hard limit)
  /**
   * Waits for a task suitable for the specified agent.
   * Supports both direct assignment (by agentId) and role-based assignment.
   * Also checks for EVICT signals.
   * 
   * @param agentId - The ID of the requesting agent.
   * @param role - The role of the requesting agent (e.g., 'developer').
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 290s).
   * @returns A promise resolving to a Task, EvictionSignal, or null if timed out.
   */
  async waitForTask(agentId: string, role: AgentRole, timeoutMs: number = 290000): Promise<Task | { controlSignal: 'EVICT', reason: string, action: 'RESTART' | 'SHUTDOWN' } | null> {
    // 0. Check for pending eviction FIRST
    const eviction = this.popEviction(agentId);
    if (eviction) {
      return { controlSignal: 'EVICT', ...eviction };
    }

    // Track this agent as waiting with role
    this.waitingAgents.set(agentId, role);

    // 1. Check if there are pending tasks for this agent
    const pendingTask = this.findPendingTaskForAgent(agentId, role);
    if (pendingTask) {
      this.waitingAgents.delete(agentId);
      this.updateStatus(pendingTask.id, 'PENDING_ACK');
      this.pendingAcks.set(pendingTask.id, {
        taskId: pendingTask.id,
        agentId,
        sentAt: Date.now()
      });
      return pendingTask;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutTimer: NodeJS.Timeout;

      // Define cleanup/completion logic
      const finish = (result: Task | { controlSignal: 'EVICT', reason: string, action: 'RESTART' | 'SHUTDOWN' } | null) => {
        if (resolved) return;
        resolved = true;

        // Cleanup listeners and timeout
        this.off('task', onTask);
        this.off('eviction', onEviction);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        // IMPORTANT: Remove from waiting list
        // If findAndReserveAgent() matched this agent, it already deleted it.
        // But for timeout/eviction cases, we need to clean up here.
        // The delete() is idempotent, so safe to call even if already removed.
        this.waitingAgents.delete(agentId);

        resolve(result);
      };

      const onTask = (task: Task, intendedAgentId?: string) => {
        // This handler receives events from findAndReserveAgent
        // The task is already reserved (PENDING_ACK status, in pendingAcks map)
        // We just need to resolve the promise if this event is for us

        // Only process if this event is specifically targeted at this agent
        if (intendedAgentId === agentId) {
          finish(task);
        }
        // Ignore events targeted at other agents or broadcast events
      };

      const onEviction = (targetId: string) => {
        if (targetId === agentId) {
          const ev = this.popEviction(agentId);
          if (ev) finish({ controlSignal: 'EVICT', ...ev });
        }
      };

      this.on('task', onTask);
      this.on('eviction', onEviction);

      // 3. Timeout handler
      timeoutTimer = setTimeout(() => {
        finish(null);
      }, timeoutMs);
    });
  }

  private isTaskForAgent(task: Task, agentId: string, role: AgentRole): boolean {
    if (task.to.agentId && task.to.agentId === agentId) return true;
    if (task.to.role && task.to.role === role) return true;
    if (!task.to.agentId && !task.to.role) return true; // Any agent
    return false;
  }

  /**
   * Finds and reserves a matching waiting agent for a task.
   * Atomically removes agent from waiting list and transitions task to PENDING_ACK.
   * 
   * @param task - The task to assign
   * @returns agentId if match found and reserved, null otherwise
   */
  private findAndReserveAgent(task: Task): string | null {
    if (this.waitingAgents.size === 0) return null;

    // Shuffle agents for fairness
    const waitingList = Array.from(this.waitingAgents.entries());
    const shuffled = waitingList
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    for (const [agentId, role] of shuffled) {
      console.log(`[Queue] Checking ${agentId} with role='${role}' against task.to.role='${task.to.role}'`);
      if (this.isTaskForAgent(task, agentId, role)) {
        // Atomic reservation in 3 steps:
        // 1. Transition task to PENDING_ACK and record in pendingAcks
        this.updateStatus(task.id, 'PENDING_ACK');
        this.pendingAcks.set(task.id, {
          taskId: task.id,
          agentId,
          sentAt: Date.now()
        });

        // 2. Emit notification to agent's listener (BEFORE removing from waitingAgents!)
        console.log(`[Queue] Reserved task ${task.id} for agent ${agentId}, notifying...`);
        this.emit('task', task, agentId);

        // 3. Remove agent from waiting list (agent's finish() will also try, but delete is idempotent)
        this.waitingAgents.delete(agentId);

        return agentId;
      }
    }
    return null;
  }

  // Acknowledge task receipt - transitions PENDING_ACK -> ASSIGNED
  /**
   * Acknowledges receipt of a task by an agent.
   * transitions the task status from 'PENDING_ACK' to 'ASSIGNED'.
   * 
   * @param taskId - The ID of the task to acknowledge.
   * @param agentId - The ID of the agent acknowledging the task.
   * @returns Object indicating success or failure.
   */
  ackTask(taskId: string, agentId: string): { success: boolean, error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // Allow re-ACK if already assigned extendedly? No.
    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: `Task status is ${task.status}, expected PENDING_ACK` };
    }

    const pending = this.pendingAcks.get(taskId);
    if (!pending) {
      // Maybe it was already removed?
      // Be lenient if status is PENDING_ACK but map is empty (shouldn't happen)
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (pending.agentId !== agentId) {
      return { success: false, error: `Task was sent to ${pending.agentId}, not ${agentId}` };
    }

    // Transition to ASSIGNED and persist assignedTo
    task.assignedTo = agentId;
    task.status = 'ASSIGNED';

    // Record History Event
    if (!task.history) task.history = [];
    task.history.push({
      timestamp: Date.now(),
      status: 'ASSIGNED',
      agentId: agentId,
      message: `Task assigned to ${agentId}`
    });

    this.persistUpdate(task);
    this.pendingAcks.delete(taskId);
    console.log(`[Queue] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);

    return { success: true };
  }

  // Wait for a specific task to complete (used for dependency coordination)
  /**
   * Waits for a specific task to reach a terminal state (COMPLETED, FAILED, BLOCKED).
   * Useful for coordinating dependent tasks.
   * 
   * @param taskId - The ID of the task to wait for.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 300s).
   * @returns A promise resolving to the completed Task or null (if timed out/active).
   */
  async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<Task | null> {
    return new Promise((resolve) => {
      let resolved = false;

      // Check if already complete
      const existingTask = this.getTask(taskId) || this.getTaskFromDB(taskId);
      if (existingTask && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(existingTask.status)) {
        console.log(`[Queue] Task ${taskId} already complete (${existingTask.status})`);
        resolve(existingTask);
        return;
      }

      // Listen for completion events
      const onCompletion = (task: Task) => {
        if (task.id === taskId && !resolved) {
          resolved = true;
          this.off('completion', onCompletion);
          console.log(`[Queue] Task ${taskId} completed with status ${task.status}`);
          resolve(task);
        }
      };

      this.on('completion', onCompletion);

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.off('completion', onCompletion);
          console.log(`[Queue] Wait for task ${taskId} timed out after ${timeoutMs}ms`);
          // Return current state even if not complete
          const task = this.getTask(taskId) || this.getTaskFromDB(taskId);
          resolve(task || null);
        }
      }, timeoutMs);
    });
  }

  updateStatus(taskId: string, status: TaskStatus, response?: any): void {
    const task = this.repo.getById(taskId);
    if (task) {
      task.status = status;
      if (response) {
        task.response = response;
        task.completedAt = Date.now(); // or failedAt
      }

      // Record History Event
      if (!task.history) task.history = [];
      task.history.push({
        timestamp: Date.now(),
        status,
        agentId: task.assignedTo, // Best guess context
        message: response ? 'Status updated with response' : `Status changed to ${status}`
      });

      this.persistUpdate(task);

      // Emit completion event for listeners (like the bot)
      if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(status)) {
        this.emit('completion', task);
        console.log(`[Queue] Emitted completion event for task ${taskId} (${status})`);
      }
    }
  }

  /**
   * Cancels a task if it is not already in a terminal state.
   * 
   * @param taskId - The ID of the task to cancel.
   * @returns Object indicating success or failure.
   */
  cancelTask(taskId: string): { success: boolean, error?: string } {
    const task = this.getTask(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const terminalStates: TaskStatus[] = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
    if (terminalStates.includes(task.status)) {
      return { success: false, error: `Task is already ${task.status}` };
    }

    // Force load into memory if it wasn't there (so updateStatus works)
    if (!this.repo.getById(taskId)) {

    }

    // Update status
    this.updateStatus(taskId, 'CANCELLED');

    // If it was waiting for ACK, remove from pendingAcks
    if (this.pendingAcks.has(taskId)) {
      this.pendingAcks.delete(taskId);
    }

    console.log(`[Queue] Task ${taskId} cancelled by admin`);
    return { success: true };
  }

  /**
   * Forces a retry of a task by resetting its status to 'QUEUED'.
   * Clears assignment and previous responses. 
   * Only applicable to active, cancelled, or failed tasks (not completed).
   * 
   * @param taskId - The ID of the task to retry.
   * @returns Object indicating success or failure.
   */
  forceRetry(taskId: string): { success: boolean, error?: string } {
    const task = this.getTask(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // Allow retry for active (stuck) or cancelled/failed tasks
    // NOT for COMPLETED
    const retryableStatuses: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK', 'CANCELLED', 'FAILED'];
    if (!retryableStatuses.includes(task.status)) {
      return { success: false, error: `Task status ${task.status} is not retryable (must be active, cancelled, or failed)` };
    }

    // Reset assignment and response (clean slate)
    task.assignedTo = undefined;
    task.response = undefined;
    task.completedAt = undefined;
    task.status = 'QUEUED';

    // Record History Event
    if (!task.history) task.history = [];
    task.history.push({
      timestamp: Date.now(),
      status: 'QUEUED',
      agentId: undefined,
      message: 'Force-retried by admin'
    });

    // Persist directly to preserve assignedTo = undefined
    this.persistUpdate(task);

    // If it was waiting for ACK, remove from pendingAcks
    if (this.pendingAcks.has(taskId)) {
      this.pendingAcks.delete(taskId);
    }

    console.log(`[Queue] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  private persistUpdate(task: Task): void {
    const updates: string[] = ['status = @status', 'assignedTo = @assignedTo'];
    const params: any = {
      id: task.id,
      status: task.status,
      assignedTo: task.assignedTo || null
    };

    if (task.response) {
      updates.push('response = @response');
      params.response = JSON.stringify(task.response);
    }
    if (task.completedAt) {
      updates.push('completedAt = @completedAt');
      params.completedAt = task.completedAt;
    }

    // Always persist history and dependencies
    updates.push('dependencies = @dependencies', 'history = @history');
    params.dependencies = JSON.stringify(task.dependencies || []);
    params.history = JSON.stringify(task.history || []);

    try {
      this.repo.update(task);
    } catch (e: any) {
      console.error(`[Queue] Failed to update task ${task.id}: ${e.message}`);
    }
  }

  // Re-queue tasks that timed out
  private requeueTask(taskId: string): void {
    const task = this.repo.getById(taskId);
    if (task) {
      this.updateStatus(taskId, 'QUEUED');
      this.pendingAcks.delete(taskId);
      console.log(`[Queue] Re-queued task ${taskId}`);
    }
  }

  // ===== Scheduler =====

  startScheduler(intervalMs: number = SCHEDULER_INTERVAL_MS): void {
    if (this.schedulerInterval) return;

    console.log('[Scheduler] Starting Hybrid Task Scheduler...');
    this.schedulerInterval = setInterval(() => {
      this.runSchedulerCycle();
    }, intervalMs);
  }

  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      console.log('[Scheduler] Stopped.');
    }
  }

  private runSchedulerCycle(): void {
    try {
      this.requeueStuckTasks();
      this.checkBlockedTasks();
      this.assignPendingTasks();
      this.rebalanceOrphanedTasks();
    } catch (e: any) {
      console.error(`[Scheduler] Cycle error: ${e.message}`);
    }
  }

  /** 1. Requeue tasks stuck in PENDING_ACK for too long */
  private requeueStuckTasks(): void {
    const now = Date.now();
    for (const [taskId, pending] of this.pendingAcks.entries()) {
      if (now - pending.sentAt > ACK_TIMEOUT_MS) {
        console.log(`[Scheduler] Task ${taskId} stuck in PENDING_ACK for >30s. Requeuing...`);
        this.forceRetry(taskId); // Reuse forceRetry logic (resets to QUEUED, cleansup)
      }
    }
  }

  /** 1.5. Check BLOCKED tasks for satisfied dependencies */
  private checkBlockedTasks(): void {
    // Get all BLOCKED tasks (they are in memory because we load them in loadFromDB)
    const blockedTasks = this.repo.getByStatus('BLOCKED');

    for (const task of blockedTasks) {
      if (!task.dependencies || task.dependencies.length === 0) {
        // Safe guard: No deps should not be blocked
        console.warn(`[Queue] Task ${task.id} was BLOCKED but has no dependencies. Unblocking.`);
        this.updateStatus(task.id, 'QUEUED');
        continue;
      }

      const allMet = task.dependencies.every(depId => {
        const dep = this.getTask(depId) || this.getTaskFromDB(depId);
        return dep && dep.status === 'COMPLETED';
      });

      if (allMet) {
        console.log(`[Queue] Task ${task.id} dependencies met. Unblocking -> QUEUED`);
        this.updateStatus(task.id, 'QUEUED');
      }
    }
  }

  /** 2. Proactively assign ALL QUEUED tasks to waiting agents */
  private assignPendingTasks(): void {
    // Find all QUEUED tasks, sorted by priority and age
    // We process ALL tasks here because if an agent is waiting, we should give them work immediately
    const queuedTasks = this.repo.getByStatuses(['QUEUED', 'APPROVED'])
      .sort((a: Task, b: Task) => {
        const pScores: Record<string, number> = { critical: 3, high: 2, normal: 1 };
        const scoreA = pScores[a.priority] || 1;
        const scoreB = pScores[b.priority] || 1;
        if (scoreA !== scoreB) return scoreB - scoreA; // Higher priority first
        return a.createdAt - b.createdAt; // Older first
      });

    if (queuedTasks.length === 0) return;

    // Shuffle waiting agents ONCE per cycle (or per task? per task is fairer)
    // Actually per task is better to avoid one agent getting all "easy" tasks in a batch

    console.log(`[Scheduler] assignPendingTasks: ${queuedTasks.length} queued, ${this.waitingAgents.size} waiting`);
    if (this.waitingAgents.size > 0) {
      const agents = Array.from(this.waitingAgents.entries()).map(([id, role]) => `${id}(${role})`).join(', ');
      console.log(`[Scheduler] Waiting agents: ${agents}`);
    }

    for (const task of queuedTasks) {
      if (this.waitingAgents.size === 0) {
        console.log(`[Scheduler] No waiting agents remaining. Stopping.`);
        break;
      }

      // Use atomic reservation to prevent race conditions
      // NOTE: findAndReserveAgent already emits 'task' event and notifies the agent
      const reservedAgentId = this.findAndReserveAgent(task);

      if (reservedAgentId) {
        console.log(`[Scheduler] ✓ Assigned task ${task.id} to agent ${reservedAgentId}`);
        // Agent already notified by findAndReserveAgent - no duplicate emit needed
      } else {
        console.log(`[Scheduler] ✗ No matching agent for task ${task.id} (to=${JSON.stringify(task.to)})`);
      }
    }
  }

  /** 3. Rebalance tasks from offline agents */
  private rebalanceOrphanedTasks(): void {
    // Get all agents that are officially "busy"
    const busyAgentIds = this.getBusyAgentIds();
    if (busyAgentIds.length === 0) return;

    // Check their last seen status from DB
    // We do a single query for all relevant agents
    const placeholders = busyAgentIds.map(() => '?').join(',');
    const rows = (this.repo as TaskRepository).database.prepare(`SELECT id, lastSeen FROM agents WHERE id IN (${placeholders})`).all(busyAgentIds) as any[];

    const now = Date.now();
    const offlineAgents = new Set<string>();

    for (const row of rows) {
      if (!row.lastSeen || (now - row.lastSeen > ORPHAN_TIMEOUT_MS)) {
        offlineAgents.add(row.id);
      }
    }

    if (offlineAgents.size === 0) return;

    // Requeue tasks assigned to these offline agents
    for (const agentId of offlineAgents) {
      const tasks = this.getAssignedTasksForAgent(agentId);
      for (const task of tasks) {
        console.log(`[Scheduler] Agent ${agentId} appears offline/orphaned. Requeuing task ${task.id}`);
        this.forceRetry(task.id);
      }
    }
  }

  private findPendingTaskForAgent(agentId: string, role: string): Task | undefined {
    // Priority: QUEUED tasks targeting this agent explicitly -> targeting role -> global?
    // Sort by priority (critical > high > normal) and age (oldest first)

    // Naive iteration for now
    const candidates = this.repo.getByStatuses(['QUEUED', 'APPROVED']);

    // Sort candidates
    candidates.sort((a: Task, b: Task) => {
      const pScores: Record<string, number> = { critical: 3, high: 2, normal: 1 };
      const scoreA = pScores[a.priority] || 1;
      const scoreB = pScores[b.priority] || 1;
      if (scoreA !== scoreB) return scoreB - scoreA; // Higher priority first
      return a.createdAt - b.createdAt; // Older first
    });

    for (const task of candidates) {
      // 1. Direct assignment
      if (task.to.agentId === agentId) return task;
      // 2. Role assignment (if no specific agentId)
      if (!task.to.agentId && task.to.role === role) return task;
      // 3. Round robin? Not implemented yet.
    }

    return undefined;
  }

  getTask(taskId: string): Task | undefined {
    return this.repo.getById(taskId) ?? undefined;
  }

  getAll(): Task[] {
    return this.repo.getActive();
  }

  /**
   * Clears all tasks and pending acknowledgments from memory and database.
   * Use with caution.
   */
  clear(): void {

    this.pendingAcks.clear();
    try {
      this.repo.clearAll();
      console.log('[Queue] Cleared all tasks');
    } catch (e: any) {
      console.error(`[Queue] Failed to clear tasks: ${e.message}`);
    }
  }

  mapRowToTask(row: any): Task {
    return {
      id: row.id,
      status: row.status as TaskStatus,
      command: 'execute_prompt', // or stored? Assume execute_prompt for stored tasks
      prompt: row.prompt,
      priority: row.priority || 'normal',
      from: {
        type: 'agent', // simplified
        id: row.fromAgentId,
        name: row.fromAgentName
      },
      to: {
        agentId: row.toAgentId,
        role: row.toAgentRole
      },
      context: JSON.parse(row.context || '{}'),
      response: row.response ? JSON.parse(row.response) : undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      assignedTo: row.assignedTo,
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : undefined,
      history: row.history ? JSON.parse(row.history) : []
    };
  }

  // ===== Agent Status Helpers =====

  /** Get all agents currently long-polling */
  getWaitingAgents(): string[] {
    return Array.from(this.waitingAgents.keys());
  }

  /** Check if a specific agent is currently waiting */
  isAgentWaiting(agentId: string): boolean {
    return this.waitingAgents.has(agentId);
  }

  /** Get all agents that are currently assigned tasks (ASSIGNED, IN_PROGRESS, PENDING_ACK) */
  getBusyAgentIds(): string[] {
    const busyStatus: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK'];
    const busyAgents = new Set<string>();

    for (const task of this.repo.getActive()) {
      // If task is active and assigned to a specific agent
      if (busyStatus.includes(task.status) && task.to.agentId) {
        busyAgents.add(task.to.agentId);
      }
    }
    return Array.from(busyAgents);
  }

  /** Get tasks assigned to or in-progress for an agent */
  getAssignedTasksForAgent(agentId: string): Task[] {
    return this.repo.getByAssignedTo(agentId);
  }

  /**
   * Retrieves variables task history with optional filtering and pagination.
   * Supports multi-status filtering via comma-separated string.
   * 
   * @param options - Query options.
   * @param options.status - Filter by task status (single or comma-separated).
   * @param options.agentId - Filter by assigned agent ID or source agent ID.
   * @param options.limit - Max number of records to return (default: 50).
   * @param options.offset - Pagination offset (default: 0).
   * @param options.search - Fuzzy search pattern for ID, Prompt, or Response.
   * @returns An array of matching Task objects.
   */
  getTaskHistory(options: {
    status?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Task[] {
    const { status, agentId, limit = 50, offset = 0, search } = options;

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any = {};

    if (search) {
      query += ' AND (id LIKE @searchPattern OR prompt LIKE @searchPattern OR response LIKE @searchPattern)';
      params.searchPattern = `%${search}%`;
    }

    if (status) {
      if (status.includes(',')) {
        const statuses = status.split(',').map(s => s.trim());
        // better-sqlite3 doesn't support array binding nicely for IN
        // so we construct named params for each
        const placeholders = statuses.map((_, i) => `@status_${i}`).join(',');
        query += ` AND status IN (${placeholders})`;
        statuses.forEach((s, i) => {
          params[`status_${i}`] = s;
        });
      } else {
        query += ' AND status = @status';
        params.status = status;
      }
    }
    if (agentId) {
      query += ' AND (toAgentId = @agentId OR fromAgentId = @agentId)';
      params.agentId = agentId;
    }

    query += ' ORDER BY createdAt DESC LIMIT @limit OFFSET @offset';
    params.limit = limit;
    params.offset = offset;

    return this.repo.getHistory({ status: status as TaskStatus | undefined, limit, offset, agentId });
  }

  /** Get a specific task from database (even if not in memory) */
  getTaskFromDB(taskId: string): Task | undefined {
    return this.repo.getById(taskId) || undefined;
  }

  // ===== Eviction Logic =====
  private evictions: Map<string, { reason: string, action: 'RESTART' | 'SHUTDOWN' }> = new Map();

  /**
   * Queues an eviction for an agent.
   * Checks priority: SHUTDOWN > RESTART.
   */
  queueEviction(agentId: string, reason: string, action: 'RESTART' | 'SHUTDOWN'): void {
    const existing = this.evictions.get(agentId);
    if (existing) {
      if (existing.action === 'SHUTDOWN' && action === 'RESTART') {
        return; // Ignore RESTART if already SHUT_DOWN
      }
    }
    this.evictions.set(agentId, { reason, action });
    console.log(`[Queue] Queued eviction for ${agentId}: ${action} (${reason})`);

    // If agent is waiting, we might need to wake them up?
    // But waitForTask checks periodically or we can emit.
    // However, waitForTask currently only listens for 'task'.
    // We should probably emit an 'eviction' event or check in the toolHandler loop.
    // Simpler: The tool handler calls getEviction() just before waiting.
    // If they are *already* long-polling, they won't get it until timeout.
    // OPTIMIZATION: Emit 'task' (dummy) or specific event to wake up waitForTask?
    // Let's implement wake-up in waitForTask properly.
    this.emit('eviction', agentId);
  }

  /**
   * Checks for and consumes a pending eviction signal for an agent.
   */
  popEviction(agentId: string): { reason: string, action: 'RESTART' | 'SHUTDOWN' } | null {
    const eviction = this.evictions.get(agentId);
    if (eviction) {
      this.evictions.delete(agentId);
      return eviction;
    }
    return null;
  }
  /**
   * Fetch recent activity logs (persisted).
   * Returns them in CHRONOLOGICAL order (Oldest -> Newest).
   */
  getLogs(limit: number = 100): any[] {
    const logs = (this.repo as TaskRepository).database.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    // Reverse to get chronological order (for feed display)
    return logs.reverse().map(l => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : undefined
    }));
  }
}
