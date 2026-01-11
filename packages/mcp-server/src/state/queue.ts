/**
 * TaskQueue - Main queue facade
 * 
 * Manages the global task queue, handling task lifecycle, assignment, and persistence.
 * 
 * Architecture:
 * - Uses TaskRepository as SINGLE SOURCE OF TRUTH for task data
 * - Uses TypedEventEmitter for type-safe events
 * - Delegates scheduling to HybridScheduler
 * - Delegates message handling to MessageService
 * - Delegates polling to PollingService
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
import { PollingService } from './services/polling-service.js';

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

  /** Service for message handling */
  private readonly messageService: MessageService;

  /** Service for polling operations */
  private readonly pollingService: PollingService;

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

    // Initialize eviction service
    this.evictionService = new EvictionService(this.db, this);

    // Initialize polling service
    this.pollingService = new PollingService(
      this.repo,
      this.persistence,
      this.matchingService,
      this.evictionService,
      this
    );

    // Initialize scheduler with this queue (implements ISchedulerQueue directly)
    this.scheduler = new HybridScheduler(this);

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
        this.repo.updateStatus(task.id, 'QUEUED');
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
    this.persistence.clearPendingAck(taskId);

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
    this.persistence.clearPendingAck(taskId);

    console.log(`[Queue] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  // ===== Messages (Delegated) =====

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

  // ===== Agent Matching & Polling (Delegated) =====

  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    timeoutMs: number = 290000
  ): Promise<Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null> {
    return this.pollingService.waitForTask(agentId, capabilities, timeoutMs);
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    return this.pollingService.ackTask(taskId, agentId);
  }

  async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<Task | null> {
    return this.pollingService.waitForTaskCompletion(taskId, timeoutMs);
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

  /** Get all agents currently waiting with their capabilities (from DB) - implements ISchedulerQueue */
  getWaitingAgents(): Map<string, StandardCapability[]> {
    return this.persistence.getWaitingAgents();
  }

  /** Get pending ACKs (from DB) - implements ISchedulerQueue */
  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    return this.persistence.getPendingAcks();
  }

  /** Get tasks by status - implements ISchedulerQueue */
  getByStatus(status: TaskStatus): Task[] {
    return this.repo.getByStatus(status);
  }

  /** Check if a specific agent is currently waiting (from DB) */
  isAgentWaiting(agentId: string): boolean {
    return this.persistence.isAgentWaiting(agentId);
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
      this.persistence.resetWaitingAgents();
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