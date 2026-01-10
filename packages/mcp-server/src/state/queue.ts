/**
 * TaskQueue - Main queue facade
 * 
 * Manages the global task queue, handling task lifecycle, assignment, and persistence.
 * 
 * Architecture:
 * - Uses TaskRepository as SINGLE SOURCE OF TRUTH for task data
 * - Uses TypedEventEmitter for type-safe events
 * - Delegates scheduling to HybridScheduler
 * - ALL STATE IS DATABASE-BACKED (no in-memory maps)
 * 
 * @module state/queue
 * @implements {ITaskQueue}
 */

import {
  Task,
  TaskStatus,
  StandardCapability
} from '@opensourcewtf/waaah-types';
import type { Database } from 'better-sqlite3';
import type { ITaskQueue, AckResult, QueueStats, HistoryOptions, WaitResult } from './queue.interface.js';
import { TypedEventEmitter } from './queue-events.js';
import { TaskRepository, type ITaskRepository } from './task-repository.js';
import { HybridScheduler, type ISchedulerQueue, SCHEDULER_INTERVAL_MS } from './scheduler.js';
import { EvictionService, type IEvictionService, type EvictionSignal } from './eviction-service.js';
import { isTaskForAgent } from './agent-matcher.js';

/**
 * Manages the global task queue, handling task lifecycle, assignment, and persistence.
 * All state is database-backed for reliability and horizontal scaling.
 */
export class TaskQueue extends TypedEventEmitter implements ITaskQueue, ISchedulerQueue {
  /** Repository for task persistence operations */
  private readonly repo: ITaskRepository;

  /** Direct database access for agent/system prompt queries */
  private readonly db: Database;

  /** Background scheduler for task management */
  private scheduler: HybridScheduler;

  /** Eviction service for agent eviction management */
  private readonly evictionService: IEvictionService;

  /**
   * Create a new TaskQueue instance.
   * @param databaseOrRepo - Database instance or TaskRepository (REQUIRED - no default to prevent production leaks)
   */
  constructor(databaseOrRepo: Database | ITaskRepository) {
    super();

    // Accept either a Database or a TaskRepository
    if ('insert' in databaseOrRepo) {
      this.repo = databaseOrRepo as ITaskRepository;
      this.db = (databaseOrRepo as TaskRepository).database;
    } else {
      this.repo = new TaskRepository(databaseOrRepo as Database);
      this.db = databaseOrRepo as Database;
    }

    // Initialize scheduler with this queue (implements ISchedulerQueue directly)
    this.scheduler = new HybridScheduler(this);

    // Initialize eviction service
    this.evictionService = new EvictionService(this.db, this);

    // Reset any PENDING_ACK tasks and waiting agents from previous run
    this.resetStaleState();
  }

  // ===== Database-backed state helpers =====

  /**
   * Get pending ACKs from database (replaces in-memory map).
   */
  private getPendingAcksFromDB(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    const rows = this.db.prepare(
      'SELECT id, pendingAckAgentId, ackSentAt FROM tasks WHERE status = ? AND pendingAckAgentId IS NOT NULL'
    ).all('PENDING_ACK') as any[];

    const map = new Map<string, { taskId: string; agentId: string; sentAt: number }>();
    for (const row of rows) {
      map.set(row.id, {
        taskId: row.id,
        agentId: row.pendingAckAgentId,
        sentAt: row.ackSentAt
      });
    }
    return map;
  }

  /**
   * Get waiting agents from database (replaces in-memory map).
   * Returns agent ID -> capabilities mapping.
   */
  private getWaitingAgentsFromDB(): Map<string, StandardCapability[]> {
    const rows = this.db.prepare(
      'SELECT id, capabilities FROM agents WHERE waitingSince IS NOT NULL'
    ).all() as any[];

    const map = new Map<string, StandardCapability[]>();
    for (const row of rows) {
      const caps = row.capabilities ? JSON.parse(row.capabilities) : [];
      map.set(row.id, caps);
    }
    return map;
  }

  /**
   * Set pending ACK state in database.
   */
  private setPendingAck(taskId: string, agentId: string): void {
    this.db.prepare(
      'UPDATE tasks SET pendingAckAgentId = ?, ackSentAt = ? WHERE id = ?'
    ).run(agentId, Date.now(), taskId);
  }

  /**
   * Clear pending ACK state in database.
   */
  private clearPendingAck(taskId: string): void {
    this.db.prepare(
      'UPDATE tasks SET pendingAckAgentId = NULL, ackSentAt = NULL WHERE id = ?'
    ).run(taskId);
  }

  /**
   * Set agent waiting state in database.
   * Creates the agent row if it doesn't exist (for tests and edge cases).
   */
  private setAgentWaiting(agentId: string, capabilities: StandardCapability[]): void {
    try {
      // Ensure agent exists (upsert pattern)
      this.db.prepare(
        'INSERT OR IGNORE INTO agents (id, displayName, capabilities) VALUES (?, ?, ?)'
      ).run(agentId, agentId, JSON.stringify(capabilities));

      this.db.prepare(
        'UPDATE agents SET waitingSince = ?, capabilities = ? WHERE id = ?'
      ).run(Date.now(), JSON.stringify(capabilities), agentId);
    } catch (e: any) {
      console.error(`[Queue] Failed to set agent waiting: ${e.message}`);
    }
  }

  /**
   * Clear agent waiting state in database.
   */
  private clearAgentWaiting(agentId: string): void {
    try {
      this.db.prepare(
        'UPDATE agents SET waitingSince = NULL WHERE id = ?'
      ).run(agentId);
    } catch (e: any) {
      console.error(`[Queue] Failed to clear agent waiting: ${e.message}`);
    }
  }

  /** Reset PENDING_ACK tasks and waiting agents on startup */
  private resetStaleState(): void {
    try {
      // Reset PENDING_ACK tasks to QUEUED
      const stale = this.repo.getByStatus('PENDING_ACK');
      for (const task of stale) {
        console.log(`[Queue] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.repo.updateStatus(task.id, 'QUEUED');
        this.clearPendingAck(task.id);
      }

      // Clear all waiting agents (connections are gone after restart)
      this.db.prepare('UPDATE agents SET waitingSince = NULL WHERE waitingSince IS NOT NULL').run();

      console.log(`[Queue] Loaded ${this.repo.getActive().length} active tasks from DB`);
    } catch {
      // Database may not be initialized yet (tests)
      console.log('[Queue] Database not ready, skipping stale state reset');
    }
  }

  // ===== Task Lifecycle =====

  /**
   * Enqueues a new task into the system.
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
      const reservedAgentId = this.findAndReserveAgent(task);

      if (reservedAgentId) {
        console.log(`[Queue] ✓ Task ${task.id} reserved for agent ${reservedAgentId}`);
      } else {
        console.log(`[Queue] No waiting agents for task ${task.id}. Task remains QUEUED.`);
      }
    } catch (e: any) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e.message}`);
    }
  }

  /**
   * Updates task status and optionally sets response.
   */
  updateStatus(taskId: string, status: TaskStatus, response?: any): void {
    const task = this.repo.getById(taskId);
    if (task) {
      task.status = status;
      if (response) {
        task.response = response;
        task.completedAt = Date.now();
      }

      // Record History Event
      if (!task.history) task.history = [];
      task.history.push({
        timestamp: Date.now(),
        status,
        agentId: task.assignedTo,
        message: response ? 'Status updated with response' : `Status changed to ${status}`
      });

      this.persistUpdate(task);

      // Emit completion event for listeners
      if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(status)) {
        this.emit('completion', task);
        console.log(`[Queue] Emitted completion event for task ${taskId} (${status})`);
      }
    }
  }

  /**
   * Cancels a task if it is not already in a terminal state.
   */
  cancelTask(taskId: string): { success: boolean; error?: string } {
    const task = this.getTask(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const terminalStates: TaskStatus[] = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
    if (terminalStates.includes(task.status)) {
      return { success: false, error: `Task is already ${task.status}` };
    }

    this.updateStatus(taskId, 'CANCELLED');
    this.clearPendingAck(taskId);

    console.log(`[Queue] Task ${taskId} cancelled by admin`);
    return { success: true };
  }

  /**
   * Forces a retry of a task by resetting its status to 'QUEUED'.
   */
  forceRetry(taskId: string): { success: boolean; error?: string } {
    const task = this.getTask(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const retryableStatuses: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK', 'CANCELLED', 'FAILED'];
    if (!retryableStatuses.includes(task.status)) {
      return { success: false, error: `Task status ${task.status} is not retryable` };
    }

    // Reset assignment and response
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

    this.persistUpdate(task);
    this.clearPendingAck(taskId);

    console.log(`[Queue] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  // ===== Messages =====

  addMessage(
    taskId: string,
    role: 'user' | 'agent' | 'system',
    content: string,
    metadata?: Record<string, unknown>,
    isRead: boolean = true,
    messageType?: 'comment' | 'review_feedback' | 'progress' | 'block_event',
    replyTo?: string
  ): void {
    try {
      this.repo.addMessage(taskId, role, content, metadata, isRead, replyTo);
      console.log(`[Queue] Added message to task ${taskId} from ${role} (isRead: ${isRead}, type: ${messageType || 'default'}${replyTo ? `, replyTo: ${replyTo}` : ''})`);
    } catch (e: any) {
      console.error(`[Queue] Failed to add message to task ${taskId}: ${e.message}`);
    }
  }

  /**
   * Add a user comment to a task (starts as unread for agent pickup).
   * Used for the mailbox feature - live comments during task execution.
   */
  addUserComment(taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]): void {
    const metadata: Record<string, unknown> = { messageType: 'comment' };
    if (images && images.length > 0) {
      metadata.images = images;
    }
    this.addMessage(taskId, 'user', content, metadata, false, 'comment', replyTo);
  }

  /**
   * Get unread user comments for a task (mailbox feature).
   */
  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, any> }> {
    try {
      return this.repo.getUnreadComments(taskId);
    } catch (e: any) {
      console.error(`[Queue] Failed to get unread comments for task ${taskId}: ${e.message}`);
      return [];
    }
  }

  /**
   * Mark all unread comments as read for a task.
   */
  markCommentsAsRead(taskId: string): number {
    try {
      return this.repo.markCommentsAsRead(taskId);
    } catch (e: any) {
      console.error(`[Queue] Failed to mark comments as read for task ${taskId}: ${e.message}`);
      return 0;
    }
  }

  getMessages(taskId: string): any[] {
    try {
      return this.repo.getMessages(taskId);
    } catch (e: any) {
      console.error(`[Queue] Failed to get messages for task ${taskId}: ${e.message}`);
      return [];
    }
  }

  // ===== Agent Matching =====

  /**
   * Waits for a task suitable for the specified agent.
   * Uses database-backed waiting state and capability-based matching.
   */
  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    timeoutMs: number = 290000
  ): Promise<Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null> {
    // 0. Check for pending eviction FIRST
    const eviction = this.popEviction(agentId);
    if (eviction) {
      return { controlSignal: 'EVICT', ...eviction };
    }

    // Track this agent as waiting in DB
    this.setAgentWaiting(agentId, capabilities);

    // 1. Check if there are pending tasks for this agent
    const pendingTask = this.findPendingTaskForAgent(agentId, capabilities);
    if (pendingTask) {
      this.clearAgentWaiting(agentId);
      this.updateStatus(pendingTask.id, 'PENDING_ACK');
      this.setPendingAck(pendingTask.id, agentId);
      return pendingTask;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutTimer: NodeJS.Timeout;

      const finish = (result: Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null) => {
        if (resolved) return;
        resolved = true;

        this.off('task', onTask);
        this.off('eviction', onEviction);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        // Clear waiting state in DB
        this.clearAgentWaiting(agentId);

        resolve(result);
      };

      const onTask = (task: Task, intendedAgentId?: string) => {
        if (intendedAgentId === agentId) {
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

      timeoutTimer = setTimeout(() => {
        finish(null);
      }, timeoutMs);
    });
  }

  /**
   * Finds a pending task suitable for an agent.
   * Skips tasks with unsatisfied dependencies.
   * Prioritizes tasks that were previously assigned to this agent (affinity on feedback).
   */
  private findPendingTaskForAgent(agentId: string, capabilities: StandardCapability[]): Task | undefined {
    const candidates = this.repo.getByStatuses(['QUEUED', 'APPROVED']);

    // Filter out tasks with unsatisfied dependencies
    const eligibleCandidates = candidates.filter(task => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return true; // No dependencies - eligible
      }
      // Check all dependencies are COMPLETED
      const allMet = task.dependencies.every(depId => {
        const dep = this.getTask(depId) || this.getTaskFromDB(depId);
        return dep && dep.status === 'COMPLETED';
      });
      if (!allMet) {
        console.log(`[Queue] Skipping task ${task.id} - dependencies not satisfied`);
      }
      return allMet;
    });

    // Sort by: 1) Agent affinity (previously assigned to this agent), 2) Priority, 3) Age
    eligibleCandidates.sort((a: Task, b: Task) => {
      // Agent affinity first - tasks previously assigned to this agent get priority
      const aAffinity = a.assignedTo === agentId ? 1 : 0;
      const bAffinity = b.assignedTo === agentId ? 1 : 0;
      if (aAffinity !== bAffinity) return bAffinity - aAffinity; // Affinity first

      const pScores: Record<string, number> = { critical: 3, high: 2, normal: 1 };
      const scoreA = pScores[a.priority] || 1;
      const scoreB = pScores[b.priority] || 1;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.createdAt - b.createdAt;
    });

    for (const task of eligibleCandidates) {
      if (task.to.agentId === agentId) return task;
      // Check if agent has required capabilities (exact match)
      const required = task.to.requiredCapabilities || [];
      if (required.length === 0 || required.every(cap => capabilities.includes(cap))) {
        return task;
      }
    }

    return undefined;
  }

  /**
   * Finds and reserves a matching waiting agent for a task.
   * Uses database-backed waiting agents state.
   */
  findAndReserveAgent(task: Task): string | null {
    const waitingAgents = this.getWaitingAgentsFromDB();
    if (waitingAgents.size === 0) return null;

    // Shuffle agents for fairness
    const waitingList = Array.from(waitingAgents.entries());
    const shuffled = waitingList
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    for (const [agentId, capabilities] of shuffled) {
      const capsArray = capabilities || [];
      console.log(`[Queue] Checking ${agentId} with capabilities=[${capsArray.join(',')}] against task.to.requiredCapabilities=[${task.to.requiredCapabilities?.join(',') || 'any'}]`);

      if (isTaskForAgent(task, agentId, capabilities)) {
        // Atomic reservation
        this.updateStatus(task.id, 'PENDING_ACK');
        this.setPendingAck(task.id, agentId);

        console.log(`[Queue] Reserved task ${task.id} for agent ${agentId}, notifying...`);
        this.emit('task', task, agentId);

        this.clearAgentWaiting(agentId);

        return agentId;
      }
    }
    return null;
  }

  /**
   * Acknowledges receipt of a task by an agent.
   * Uses database-backed pending ACK state.
   */
  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: `Task status is ${task.status}, expected PENDING_ACK` };
    }

    // Check pending ACK in database
    const row = this.db.prepare(
      'SELECT pendingAckAgentId FROM tasks WHERE id = ?'
    ).get(taskId) as any;

    if (!row?.pendingAckAgentId) {
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (row.pendingAckAgentId !== agentId) {
      return { success: false, error: `Task was sent to ${row.pendingAckAgentId}, not ${agentId}` };
    }

    task.assignedTo = agentId;
    task.status = 'ASSIGNED';

    if (!task.history) task.history = [];
    task.history.push({
      timestamp: Date.now(),
      status: 'ASSIGNED',
      agentId: agentId,
      message: `Task assigned to ${agentId}`
    });

    this.persistUpdate(task);
    this.clearPendingAck(taskId);
    console.log(`[Queue] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);

    return { success: true };
  }

  async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<Task | null> {
    return new Promise((resolve) => {
      let resolved = false;

      const existingTask = this.getTask(taskId) || this.getTaskFromDB(taskId);
      if (existingTask && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(existingTask.status)) {
        console.log(`[Queue] Task ${taskId} already complete (${existingTask.status})`);
        resolve(existingTask);
        return;
      }

      const onCompletion = (task: Task) => {
        if (task.id === taskId && !resolved) {
          resolved = true;
          this.off('completion', onCompletion);
          console.log(`[Queue] Task ${taskId} completed with status ${task.status}`);
          resolve(task);
        }
      };

      this.on('completion', onCompletion);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.off('completion', onCompletion);
          console.log(`[Queue] Wait for task ${taskId} timed out after ${timeoutMs}ms`);
          const task = this.getTask(taskId) || this.getTaskFromDB(taskId);
          resolve(task || null);
        }
      }, timeoutMs);
    });
  }

  // ===== Scheduler =====

  startScheduler(intervalMs: number = SCHEDULER_INTERVAL_MS): void {
    this.scheduler.start(intervalMs);
  }

  stopScheduler(): void {
    this.scheduler.stop();
  }

  // ===== Accessors =====

  getTask(taskId: string): Task | undefined {
    return this.repo.getById(taskId) ?? undefined;
  }

  getTaskFromDB(taskId: string): Task | undefined {
    return this.repo.getById(taskId) || undefined;
  }

  getAll(): Task[] {
    return this.repo.getActive();
  }

  getStats(): { total: number; completed: number } {
    try {
      const stats = this.repo.getStats();
      return {
        total: stats.total,
        completed: stats.byStatus['COMPLETED'] || 0
      };
    } catch (e) {
      console.error("Failed to get queue stats", e);
      return { total: 0, completed: 0 };
    }
  }

  getByStatuses(statuses: TaskStatus[]): Task[] {
    return this.repo.getByStatuses(statuses);
  }

  getTaskHistory(options: {
    status?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Task[] {
    const { status, agentId, limit = 50, offset = 0 } = options;
    return this.repo.getHistory({ status: status as TaskStatus | undefined, limit, offset, agentId });
  }

  /** Get all agents currently waiting with their capabilities (from DB) - implements ISchedulerQueue */
  getWaitingAgents(): Map<string, StandardCapability[]> {
    return this.getWaitingAgentsFromDB();
  }

  /** Get pending ACKs (from DB) - implements ISchedulerQueue */
  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    return this.getPendingAcksFromDB();
  }

  /** Get tasks by status - implements ISchedulerQueue */
  getByStatus(status: TaskStatus): Task[] {
    return this.repo.getByStatus(status);
  }

  /** Check if a specific agent is currently waiting (from DB) */
  isAgentWaiting(agentId: string): boolean {
    const row = this.db.prepare('SELECT waitingSince FROM agents WHERE id = ?').get(agentId) as any;
    return row?.waitingSince != null;
  }

  /** Get all agents that are currently assigned tasks */
  getBusyAgentIds(): string[] {
    const busyStatus: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK'];
    const busyAgents = new Set<string>();

    for (const task of this.repo.getActive()) {
      if (busyStatus.includes(task.status) && task.to.agentId) {
        busyAgents.add(task.to.agentId);
      }
    }
    return Array.from(busyAgents);
  }

  /** Get tasks assigned to an agent */
  /** Get tasks assigned to an agent (Active only) */
  getAssignedTasksForAgent(agentId: string): Task[] {
    const all = this.repo.getByAssignedTo(agentId);
    return all.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(t.status));
  }

  /** Get agent's last seen timestamp from database */
  getAgentLastSeen(agentId: string): number | undefined {
    try {
      const row = this.db.prepare('SELECT lastSeen FROM agents WHERE id = ?').get(agentId) as any;
      return row?.lastSeen;
    } catch {
      return undefined;
    }
  }

  clear(): void {
    try {
      this.repo.clearAll();
      // Also clear waiting agents
      this.db.prepare('UPDATE agents SET waitingSince = NULL').run();
      console.log('[Queue] Cleared all tasks');
    } catch (e: any) {
      console.error(`[Queue] Failed to clear tasks: ${e.message}`);
    }
  }

  // ===== Eviction Logic (delegated to EvictionService) =====

  /**
   * Queues an eviction for an agent.
   * @see EvictionService.queueEviction
   */
  queueEviction(agentId: string, reason: string, action: 'RESTART' | 'SHUTDOWN'): void {
    this.evictionService.queueEviction(agentId, reason, action);
  }

  /**
   * Checks for and consumes a pending eviction signal.
   * @see EvictionService.popEviction
   */
  popEviction(agentId: string): EvictionSignal | null {
    return this.evictionService.popEviction(agentId);
  }

  // ===== System Prompts (DB-backed) =====

  queueSystemPrompt(
    agentId: string,
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE',
    message: string,
    payload?: Record<string, unknown>,
    priority?: 'normal' | 'high' | 'critical'
  ): void {
    this.db.prepare(
      'INSERT INTO system_prompts (agentId, promptType, message, payload, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(agentId, promptType, message, payload ? JSON.stringify(payload) : null, priority || 'normal', Date.now());

    console.log(`[Queue] Queued system prompt for ${agentId}: ${promptType}`);
  }

  popSystemPrompt(agentId: string): {
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE';
    message: string;
    payload?: Record<string, unknown>;
    priority?: 'normal' | 'high' | 'critical';
  } | null {
    // Try agent-specific prompt first
    let row = this.db.prepare(
      'SELECT id, promptType, message, payload, priority FROM system_prompts WHERE agentId = ? ORDER BY createdAt ASC LIMIT 1'
    ).get(agentId) as any;

    // Fall back to broadcast prompts
    if (!row) {
      row = this.db.prepare(
        'SELECT id, promptType, message, payload, priority FROM system_prompts WHERE agentId = ? ORDER BY createdAt ASC LIMIT 1'
      ).get('*') as any;
    }

    if (row) {
      // Delete the consumed prompt
      this.db.prepare('DELETE FROM system_prompts WHERE id = ?').run(row.id);

      return {
        promptType: row.promptType,
        message: row.message,
        payload: row.payload ? JSON.parse(row.payload) : undefined,
        priority: row.priority
      };
    }

    return null;
  }

  /**
   * Fetch recent activity logs.
   */
  getLogs(limit: number = 100): any[] {
    const logs = this.db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    return logs.reverse().map(l => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : undefined
    }));
  }

  // ===== Internal Helpers =====

  private persistUpdate(task: Task): void {
    try {
      this.repo.update(task);
    } catch (e: any) {
      console.error(`[Queue] Failed to update task ${task.id}: ${e.message}`);
    }
  }

  mapRowToTask(row: any): Task {
    return {
      id: row.id,
      status: row.status as TaskStatus,
      command: 'execute_prompt',
      prompt: row.prompt,
      priority: row.priority || 'normal',
      from: {
        type: 'agent',
        id: row.fromAgentId,
        name: row.fromAgentName
      },
      to: {
        agentId: row.toAgentId,
        requiredCapabilities: row.toRequiredCapabilities ? JSON.parse(row.toRequiredCapabilities) : undefined,
        workspaceId: row.toWorkspaceId
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
}
