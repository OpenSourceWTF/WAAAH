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
import { QueuePersistence } from './persistence/queue-persistence.js';
import { SystemPromptService } from './services/system-prompt-service.js';
import { AgentMatchingService } from './services/agent-matching-service.js';
import { MessageService } from './services/message-service.js';
import { TaskLifecycleService } from './services/task-lifecycle-service.js';
import { TaskQueryService } from './services/task-query-service.js';

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

  /** Persistence helper for queue state */
  private readonly persistence: QueuePersistence;

  /** Service for handling system prompts */
  private readonly systemPromptService: SystemPromptService;

  /** Service for agent matching logic */
  private readonly matchingService: AgentMatchingService;

  /** Service for message operations */
  private readonly messageService: MessageService;

  /** Service for task lifecycle transitions */
  private readonly lifecycleService: TaskLifecycleService;

  /** Service for task queries */
  private readonly queryService: TaskQueryService;

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

    // Initialize helpers and services
    this.persistence = new QueuePersistence(this.db);
    this.systemPromptService = new SystemPromptService(this.db);
    this.matchingService = new AgentMatchingService(this.repo, this.persistence);
    this.messageService = new MessageService(this.repo);
    this.lifecycleService = new TaskLifecycleService(this.repo, this, this.persistence);
    this.queryService = new TaskQueryService(this.repo, this.persistence);

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
        this.lifecycleService.updateStatus(task.id, 'QUEUED');
        this.persistence.clearPendingAck(task.id);
      }

      // Clear all waiting agents
      this.persistence.resetWaitingAgents();

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
      const reservedAgentId = this.matchingService.reserveAgentForTask(task);

      if (reservedAgentId) {
        console.log(`[Queue] ✓ Task ${task.id} reserved for agent ${reservedAgentId}`);
        // Notify the agent via event
        this.emit('task', task, reservedAgentId);
      } else {
        console.log(`[Queue] No waiting agents for task ${task.id}. Task remains QUEUED.`);
      }
    } catch (e: any) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e.message}`);
    }
  }

  updateStatus(taskId: string, status: TaskStatus, response?: any): void {
    this.lifecycleService.updateStatus(taskId, status, response);
  }

  cancelTask(taskId: string): { success: boolean; error?: string } {
    return this.lifecycleService.cancelTask(taskId);
  }

  forceRetry(taskId: string): { success: boolean; error?: string } {
    return this.lifecycleService.forceRetry(taskId);
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
    this.messageService.addMessage(taskId, role, content, metadata, isRead, messageType, replyTo);
  }

  addUserComment(taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]): void {
    this.messageService.addUserComment(taskId, content, replyTo, images);
  }

  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, any> }> {
    return this.messageService.getUnreadComments(taskId);
  }

  markCommentsAsRead(taskId: string): number {
    return this.messageService.markCommentsAsRead(taskId);
  }

  getMessages(taskId: string): any[] {
    return this.messageService.getMessages(taskId);
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
    this.persistence.setAgentWaiting(agentId, capabilities);

    // 1. Check if there are pending tasks for this agent
    const pendingTask = this.matchingService.findPendingTaskForAgent(agentId, capabilities);
    if (pendingTask) {
      this.persistence.clearAgentWaiting(agentId);
      this.lifecycleService.updateStatus(pendingTask.id, 'PENDING_ACK');
      this.persistence.setPendingAck(pendingTask.id, agentId);
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
        this.persistence.clearAgentWaiting(agentId);

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

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: `Task status is ${task.status}, expected PENDING_ACK` };
    }

    // Check pending ACK in database
    const pendingAcks = this.persistence.getPendingAcks();
    const pendingInfo = pendingAcks.get(taskId);

    if (!pendingInfo) {
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (pendingInfo.agentId !== agentId) {
      return { success: false, error: `Task was sent to ${pendingInfo.agentId}, not ${agentId}` };
    }

    // Use lifecycle service to update status AND assignment
    this.lifecycleService.updateStatus(taskId, 'ASSIGNED', undefined, agentId);
    
    this.persistence.clearPendingAck(taskId);
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

  // ===== Accessors (Delegated to TaskQueryService) =====

  getTask(taskId: string): Task | undefined {
    return this.queryService.getTask(taskId);
  }

  getTaskFromDB(taskId: string): Task | undefined {
    return this.queryService.getTaskFromDB(taskId);
  }

  getAll(): Task[] {
    return this.queryService.getAll();
  }

  getStats(): { total: number; completed: number } {
    return this.queryService.getStats();
  }

  getByStatuses(statuses: TaskStatus[]): Task[] {
    return this.queryService.getByStatuses(statuses);
  }

  getTaskHistory(options: any = {}): Task[] {
    return this.queryService.getTaskHistory(options);
  }

  getWaitingAgents(): Map<string, StandardCapability[]> {
    return this.queryService.getWaitingAgents();
  }

  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    return this.queryService.getPendingAcks();
  }

  getByStatus(status: TaskStatus): Task[] {
    return this.queryService.getByStatus(status);
  }

  isAgentWaiting(agentId: string): boolean {
    return this.queryService.isAgentWaiting(agentId);
  }

  getBusyAgentIds(): string[] {
    return this.queryService.getBusyAgentIds();
  }

  getAssignedTasksForAgent(agentId: string): Task[] {
    return this.queryService.getAssignedTasksForAgent(agentId);
  }

  getAgentLastSeen(agentId: string): number | undefined {
    return this.queryService.getAgentLastSeen(agentId);
  }

  clear(): void {
    this.queryService.clear();
  }

  // ===== Eviction Logic (delegated to EvictionService) =====

  queueEviction(agentId: string, reason: string, action: 'RESTART' | 'SHUTDOWN'): void {
    this.evictionService.queueEviction(agentId, reason, action);
  }

  popEviction(agentId: string): EvictionSignal | null {
    return this.evictionService.popEviction(agentId);
  }

  // ===== System Prompts (delegated to SystemPromptService) =====

  queueSystemPrompt(
    agentId: string,
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE',
    message: string,
    payload?: Record<string, unknown>,
    priority?: 'normal' | 'high' | 'critical'
  ): void {
    this.systemPromptService.queueSystemPrompt(agentId, promptType, message, payload, priority);
    console.log(`[Queue] Queued system prompt for ${agentId}: ${promptType}`);
  }

  popSystemPrompt(agentId: string): {
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE';
    message: string;
    payload?: Record<string, unknown>;
    priority?: 'normal' | 'high' | 'critical';
  } | null {
    return this.systemPromptService.popSystemPrompt(agentId);
  }

  getLogs(limit: number = 100): any[] {
    return this.queryService.getLogs(limit);
  }
}