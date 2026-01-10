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
 * Refactored into:
 * - QueueDbState: DB access for queue state
 * - MessageManager: Message operations
 * - SystemPromptManager: System prompt operations
 * - TaskLifecycle: Status updates, cancellation, retry
 * - AgentCoordinator: Agent matching and assignment
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
import type { ITaskQueue, QueueStats } from './queue.interface.js';
import { TypedEventEmitter } from './queue-events.js';
import { TaskRepository, type ITaskRepository } from './task-repository.js';
import { HybridScheduler, type ISchedulerQueue, SCHEDULER_INTERVAL_MS } from './scheduler.js';
import { EvictionService, type IEvictionService, type EvictionSignal } from './eviction-service.js';

import { QueueDbState } from './queue-db-state.js';
import { MessageManager } from './message-manager.js';
import { SystemPromptManager } from './system-prompt-manager.js';
import { TaskLifecycle } from './task-lifecycle.js';
import { AgentCoordinator } from './agent-coordinator.js';

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

  // Sub-modules
  private readonly dbState: QueueDbState;
  private readonly messageManager: MessageManager;
  private readonly systemPromptManager: SystemPromptManager;
  private readonly lifecycle: TaskLifecycle;
  private readonly agentCoordinator: AgentCoordinator;

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

    // Initialize sub-modules
    this.dbState = new QueueDbState(this.db);
    this.messageManager = new MessageManager(this.repo);
    this.systemPromptManager = new SystemPromptManager(this.db);
    this.lifecycle = new TaskLifecycle(this.repo, this, this.dbState);
    this.agentCoordinator = new AgentCoordinator(this.dbState, this.repo, this, this.lifecycle);

    // Initialize scheduler with this queue (implements ISchedulerQueue directly)
    this.scheduler = new HybridScheduler(this);

    // Initialize eviction service
    this.evictionService = new EvictionService(this.db, this);

    // Reset any PENDING_ACK tasks and waiting agents from previous run
    this.resetStaleState();
  }

  /** Reset PENDING_ACK tasks and waiting agents on startup */
  private resetStaleState(): void {
    try {
      // Reset PENDING_ACK tasks to QUEUED
      const stale = this.repo.getByStatus('PENDING_ACK');
      for (const task of stale) {
        console.log(`[Queue] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.lifecycle.updateStatus(task.id, 'QUEUED');
        this.dbState.clearPendingAck(task.id);
      }

      // Clear all waiting agents
      this.dbState.clearAllWaitingAgents();

      console.log(`[Queue] Loaded ${this.repo.getActive().length} active tasks from DB`);
    } catch {
      // Database may not be initialized yet (tests)
      console.log('[Queue] Database not ready, skipping stale state reset');
    }
  }

  // ===== Task Lifecycle =====

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
      const reservedAgentId = this.agentCoordinator.findAndReserveAgent(task);

      if (reservedAgentId) {
        console.log(`[Queue] ✓ Task ${task.id} reserved for agent ${reservedAgentId}`);
      } else {
        console.log(`[Queue] No waiting agents for task ${task.id}. Task remains QUEUED.`);
      }
    } catch (e: any) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e.message}`);
    }
  }

  updateStatus(taskId: string, status: TaskStatus, response?: any): void {
    this.lifecycle.updateStatus(taskId, status, response);
  }

  cancelTask(taskId: string): { success: boolean; error?: string } {
    return this.lifecycle.cancelTask(taskId);
  }

  forceRetry(taskId: string): { success: boolean; error?: string } {
    return this.lifecycle.forceRetry(taskId);
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
    this.messageManager.addMessage(taskId, role, content, metadata, isRead, messageType, replyTo);
  }

  addUserComment(taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]): void {
    this.messageManager.addUserComment(taskId, content, replyTo, images);
  }

  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, any> }> {
    return this.messageManager.getUnreadComments(taskId);
  }

  markCommentsAsRead(taskId: string): number {
    return this.messageManager.markCommentsAsRead(taskId);
  }

  getMessages(taskId: string): any[] {
    return this.messageManager.getMessages(taskId);
  }

  // ===== Agent Matching =====

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
    this.dbState.setAgentWaiting(agentId, capabilities);

    // 1. Check if there are pending tasks for this agent
    const pendingTask = this.agentCoordinator.findPendingTaskForAgent(agentId, capabilities);
    if (pendingTask) {
      this.dbState.clearAgentWaiting(agentId);
      this.lifecycle.updateStatus(pendingTask.id, 'PENDING_ACK');
      this.dbState.setPendingAck(pendingTask.id, agentId);
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
        this.dbState.clearAgentWaiting(agentId);

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

  findAndReserveAgent(task: Task): string | null {
    return this.agentCoordinator.findAndReserveAgent(task);
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    return this.agentCoordinator.ackTask(taskId, agentId);
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
    const { status, agentId, limit = 50, offset = 0, search } = options;
    return this.repo.getHistory({ status: status as TaskStatus | 'ACTIVE' | undefined, limit, offset, agentId, search });
  }

  getWaitingAgents(): Map<string, StandardCapability[]> {
    return this.dbState.getWaitingAgents();
  }

  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    return this.dbState.getPendingAcks();
  }

  getByStatus(status: TaskStatus): Task[] {
    return this.repo.getByStatus(status);
  }

  isAgentWaiting(agentId: string): boolean {
    return this.dbState.isAgentWaiting(agentId);
  }

  getBusyAgentIds(): string[] {
    return this.agentCoordinator.getBusyAgentIds();
  }

  getAssignedTasksForAgent(agentId: string): Task[] {
    return this.agentCoordinator.getAssignedTasksForAgent(agentId);
  }

  getAgentLastSeen(agentId: string): number | undefined {
    return this.dbState.getAgentLastSeen(agentId);
  }

  clear(): void {
    try {
      this.repo.clearAll();
      this.dbState.clearAllWaitingAgents();
      console.log('[Queue] Cleared all tasks');
    } catch (e: any) {
      console.error(`[Queue] Failed to clear tasks: ${e.message}`);
    }
  }

  // ===== Eviction Logic =====

  queueEviction(agentId: string, reason: string, action: 'RESTART' | 'SHUTDOWN'): void {
    this.evictionService.queueEviction(agentId, reason, action);
  }

  popEviction(agentId: string): EvictionSignal | null {
    return this.evictionService.popEviction(agentId);
  }

  // ===== System Prompts =====

  queueSystemPrompt(
    agentId: string,
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE',
    message: string,
    payload?: Record<string, unknown>,
    priority?: 'normal' | 'high' | 'critical'
  ): void {
    this.systemPromptManager.queueSystemPrompt(agentId, promptType, message, payload, priority);
  }

  popSystemPrompt(agentId: string): {
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE';
    message: string;
    payload?: Record<string, unknown>;
    priority?: 'normal' | 'high' | 'critical';
  } | null {
    return this.systemPromptManager.popSystemPrompt(agentId);
  }

  getLogs(limit: number = 100): any[] {
    const logs = this.db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?').all(limit) as any[];
    return logs.reverse().map(l => ({
      ...l,
      metadata: l.metadata ? JSON.parse(l.metadata) : undefined
    }));
  }

  // ===== Internal Helpers =====

  mapRowToTask(row: any): Task {
    // Deprecated? It was not used in the original file except maybe as a utility not exported.
    // It was used in previous versions maybe.
    // I'll keep it if it was there, but it seems unused in the class itself.
    // Wait, the original code had it.
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