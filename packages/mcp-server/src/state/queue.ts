import { EventEmitter } from 'events';
import {
  Task,
  TaskStatus,
  AgentRole
} from '@waaah/types';
import { db } from './db.js';

const ACK_TIMEOUT_MS = 60000;         // 60s to ACK a task before it's requeued
const SCHEDULER_INTERVAL_MS = 10000;  // Run scheduler every 10s
const ORPHAN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes offline = orphan

/**
 * Manages the global task queue, handling task lifecycle, assignment, and persistence.
 * Emits 'task' events when new tasks are enqueued and 'completion' events when they finish.
 */
export class TaskQueue extends EventEmitter {
  // In-memory cache for fast access, but source of truth is DB
  private tasks: Map<string, Task> = new Map();
  // Map<TaskId, { agentId, sentAt }>
  private pendingAcks: Map<string, { taskId: string, agentId: string, sentAt: number }> = new Map();
  // Track agents currently long-polling (WAITING state) - Maps AgentID -> Role
  private waitingAgents: Map<string, AgentRole> = new Map();

  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.loadFromDB();
    // Scheduler is started explicitly by server.ts
  }

  private loadFromDB(): void {
    // Load active tasks (QUEUED, PENDING_ACK, ASSIGNED, IN_PROGRESS)
    // We might want COMPLETED for history, but for queue logic we need active.
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE status IN ('QUEUED', 'PENDING_ACK', 'ASSIGNED', 'IN_PROGRESS')
    `).all() as any[];

    for (const row of rows) {
      const task = this.mapRowToTask(row);
      this.tasks.set(task.id, task);

      if (task.status === 'PENDING_ACK') {
        // If it was PENDING_ACK on restart, we should probably reset it to QUEUED
        // because the agent connection is gone.
        // OR we load it into pendingAcks and see if it times out immediately?
        // Let's reset to QUEUED to be safe, as the agent is definitely disconnected.
        console.log(`[Queue] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.updateStatus(task.id, 'QUEUED');
      }
    }
    console.log(`[Queue] Loaded ${this.tasks.size} active tasks from DB`);
  }

  /**
   * Enqueues a new task into the system.
   * Persists the task to the database and emits an event for waiting agents.
   * 
   * @param task - The task object to enqueue.
   */
  enqueue(task: Task): void {
    this.tasks.set(task.id, task);

    try {
      db.prepare(`
        INSERT INTO tasks (
          id, status, prompt, priority, 
          fromAgentId, fromAgentName, 
          toAgentId, toAgentRole, 
          context, createdAt
        ) VALUES (
          @id, @status, @prompt, @priority, 
          @fromAgentId, @fromAgentName, 
          @toAgentId, @toAgentRole, 
          @context, @createdAt
        )
      `).run({
        id: task.id,
        status: task.status,
        prompt: task.prompt,
        priority: task.priority,
        fromAgentId: task.from.id,
        fromAgentName: task.from.name,
        toAgentId: task.to.agentId || null,
        toAgentRole: task.to.role || null,
        context: JSON.stringify(task.context || {}),
        createdAt: task.createdAt
      });
      console.log(`[Queue] Enqueued task: ${task.id} (${task.status})`);

      // Emit event for waiting agents
      this.emit('task', task);
    } catch (e: any) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e.message}`);
    }
  }

  /**
   * Retrieves current queue statistics.
   * 
   * @returns An object containing the total count of tasks and the count of completed tasks.
   */
  getStats(): { total: number, completed: number } {
    try {
      const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get() as { count: number };
      const completed = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE status = 'COMPLETED'").get() as { count: number };
      return { total: total.count, completed: completed.count };
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

        // Cleanup
        this.off('task', onTask);
        this.off('eviction', onEviction);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        this.waitingAgents.delete(agentId);

        if (result && 'id' in result) { // It's a Task
          this.updateStatus(result.id, 'PENDING_ACK');
          this.pendingAcks.set(result.id, {
            taskId: result.id,
            agentId,
            sentAt: Date.now()
          });
        }

        resolve(result);
      };

      const onTask = (task: Task) => {
        // Check if this task is for this agent
        if (task.status === 'QUEUED' && this.isTaskForAgent(task, agentId, role)) {
          finish(task);
        }
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
    const task = this.tasks.get(taskId);
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

    // Transition to ASSIGNED
    task.assignedTo = agentId;
    this.updateStatus(taskId, 'ASSIGNED');
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
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (response) {
        task.response = response;
        task.completedAt = Date.now(); // or failedAt
      }

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
    let task = this.tasks.get(taskId);

    // If not in memory, check DB
    if (!task) {
      task = this.getTaskFromDB(taskId);
    }

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const terminalStates: TaskStatus[] = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
    if (terminalStates.includes(task.status)) {
      return { success: false, error: `Task is already ${task.status}` };
    }

    // Force load into memory if it wasn't there (so updateStatus works)
    if (!this.tasks.has(taskId)) {
      this.tasks.set(taskId, task);
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
    let task = this.tasks.get(taskId);

    // If not in memory, check DB
    if (!task) {
      task = this.getTaskFromDB(taskId);
    }

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // Allow retry for active (stuck) or cancelled/failed tasks
    // NOT for COMPLETED
    const retryableStatuses: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK', 'CANCELLED', 'FAILED'];
    if (!retryableStatuses.includes(task.status)) {
      return { success: false, error: `Task status ${task.status} is not retryable (must be active, cancelled, or failed)` };
    }

    // Force load into memory if it wasn't there
    if (!this.tasks.has(taskId)) {
      this.tasks.set(taskId, task);
    }

    // Reset assignment
    task.assignedTo = undefined;
    // Clear response/completedAt if they exist (clean slate)
    task.response = undefined;
    task.completedAt = undefined;

    // Update status to QUEUED
    this.updateStatus(taskId, 'QUEUED');

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

    try {
      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = @id`).run(params);
    } catch (e: any) {
      console.error(`[Queue] Failed to update task ${task.id}: ${e.message}`);
    }
  }

  // Re-queue tasks that timed out
  private requeueTask(taskId: string): void {
    const task = this.tasks.get(taskId);
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
      this.assignHighPriorityTasks();
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
        console.log(`[Scheduler] Task ${taskId} stuck in PENDING_ACK for >60s. Requeuing...`);
        this.forceRetry(taskId); // Reuse forceRetry logic (resets to QUEUED, cleansup)
      }
    }
  }

  /** 2. Proactively assign High/Critical tasks to waiting agents */
  private assignHighPriorityTasks(): void {
    // Find high priority tasks that are QUEUED
    const criticalTasks = Array.from(this.tasks.values()).filter(t =>
      t.status === 'QUEUED' && (t.priority === 'high' || t.priority === 'critical')
    );

    if (criticalTasks.length === 0) return;

    for (const task of criticalTasks) {
      // Find a suitable waiting agent
      for (const [agentId, role] of this.waitingAgents.entries()) {
        if (this.isTaskForAgent(task, agentId, role)) {
          console.log(`[Scheduler] Proactively assigning high-priority task ${task.id} to waiting agent ${agentId}`);
          // Emit task event again to wake up the specific agent's waitForTask promise
          this.emit('task', task);
          // Note: The actual assignment (status update) happens inside waitForTask listener
          break; // Assigned one, move to next task
        }
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
    const rows = db.prepare(`SELECT id, lastSeen FROM agents WHERE id IN (${placeholders})`).all(busyAgentIds) as any[];

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
    const candidates = Array.from(this.tasks.values()).filter(t => t.status === 'QUEUED');

    // Sort candidates
    candidates.sort((a, b) => {
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
    return this.tasks.get(taskId);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Clears all tasks and pending acknowledgments from memory and database.
   * Use with caution.
   */
  clear(): void {
    this.tasks.clear();
    this.pendingAcks.clear();
    try {
      db.prepare('DELETE FROM tasks').run();
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
      assignedTo: row.assignedTo
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

    for (const task of this.tasks.values()) {
      // If task is active and assigned to a specific agent
      if (busyStatus.includes(task.status) && task.to.agentId) {
        busyAgents.add(task.to.agentId);
      }
    }
    return Array.from(busyAgents);
  }

  /** Get tasks assigned to or in-progress for an agent */
  getAssignedTasksForAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(t =>
      (t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'PENDING_ACK') &&
      (t.assignedTo === agentId || (!t.assignedTo && t.to.agentId === agentId))
    );
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

    const rows = db.prepare(query).all(params) as any[];
    return rows.map(row => this.mapRowToTask(row));
  }

  /** Get a specific task from database (even if not in memory) */
  getTaskFromDB(taskId: string): Task | undefined {
    const row = db.prepare('SELECT * FROM tasks WHERE id = @id').get({ id: taskId }) as any;
    return row ? this.mapRowToTask(row) : undefined;
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
    const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    // Reverse to get chronological order (for feed display)
    return logs.reverse().map(l => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : undefined
    }));
  }
}
