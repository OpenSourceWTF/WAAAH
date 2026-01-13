/**
 * TaskQueue - Main queue facade
 *
 * Primary queue management component handling task operations.
 *
 * Architecture:
 * - TaskRepository as SINGLE SOURCE OF TRUTH
 * - TypedEventEmitter - type-safe events
 * - HybridScheduler - scheduling
 * - MessageService - messages
 * - PollingService - agent polling
 * - TaskLifecycleService - task states
 * - ALL STATE IS DATABASE-BACKED
 *
 * @module state/queue
 * @implements {ITaskQueue}
 */

import {
  Task,
  TaskStatus,
  StandardCapability,
  EvictionSignal,
  SystemPrompt,
  assignTaskSchema,
  WorkspaceContext
} from '@opensourcewtf/waaah-types';
import type { Database } from 'better-sqlite3';
import { ITaskQueue, QueueStats, WaitResult, HistoryOptions } from './queue.interface.js';
// import { StateHashService } from './services/state-hash-service.js';
import { TypedEventEmitter } from './queue-events.js';
import { TaskRepository, type ITaskRepository } from './persistence/task-repository.js';
import { HybridScheduler, SCHEDULER_INTERVAL_MS } from './scheduler.js';
import { EvictionService, type IEvictionService } from './eviction-service.js';
import { QueuePersistence } from './persistence/queue-persistence.js';
import { SystemPromptService } from './services/system-prompt-service.js';
import { AgentMatchingService } from './services/agent-matching-service.js';
import { MessageService } from './services/message-service.js';
import { PollingService } from './services/polling-service.js';
import { TaskLifecycleService } from './services/task-lifecycle-service.js';
import { emitTaskUpdated } from './eventbus.js'; // Only for messages (repo handles rest)

/**
 * Primary queue management component.
 * All state is database-backed.
 */
export class TaskQueue extends TypedEventEmitter implements ITaskQueue {
  /** Task persistence ops */
  private readonly repo: ITaskRepository;

  /** Database access - agent/prompt queries */
  private readonly db: Database;

  /** Background scheduler */
  private scheduler: HybridScheduler;

  /** Eviction management */
  private readonly evictionService: IEvictionService;

  /** Queue state persistence */
  private readonly persistence: QueuePersistence;

  /** System prompts */
  private readonly systemPromptService: SystemPromptService;

  /** Agent matching */
  private readonly matchingService: AgentMatchingService;

  /** Message handling */
  private readonly messageService: MessageService;

  /** Polling ops */
  private readonly pollingService: PollingService;

  /** Task state management */
  private readonly stateService: TaskLifecycleService;

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
      this,
      // Callback when agent starts waiting - trigger immediate scheduler cycle
      () => this.scheduler?.runCycle()
    );

    // Init state management
    this.stateService = new TaskLifecycleService(
      this.repo,
      this.matchingService,
      this.persistence
    );

    // Initialize scheduler with this queue (implements ISchedulerQueue directly)
    this.scheduler = new HybridScheduler(this);

    // Reset any PENDING_ACK tasks and waiting agents from previous run
    this.pollingService.resetStaleState();
  }

  /**
   * Enqueues a new task into the system.
   */
  enqueue(task: Task): void {
    try {
      const reservedAgentId = this.stateService.enqueue(task);
      const status = reservedAgentId
        ? `✓ Task ${task.id} reserved: ${reservedAgentId}`
        : `No waiting agents: ${task.id}. Task remains QUEUED.`;
      console.log(`[Queue] ${status}`);
      reservedAgentId && this.emit('task', task, reservedAgentId);
      // Note: emitTaskCreated now handled by TaskRepository.insert()
    } catch (e: unknown) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Updates task status and optionally sets response.
   */
  updateStatus(taskId: string, status: TaskStatus, response?: any): void {
    const task = this.stateService.updateStatus(taskId, status, response);
    const isTerminal = task && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(status);
    isTerminal && (this.emit('completion', task), console.log(`[Queue] Emitted completion: ${taskId} (${status})`));
    // Note: emitTaskUpdated now handled by TaskRepository.update()
  }

  /**
   * Cancels a task not already in a terminal state.
   */
  cancelTask(taskId: string): { success: boolean; error?: string } {
    return this.stateService.cancelTask(taskId);
  }

  /**
   * Forces a retry of a task by resetting its status to 'QUEUED'.
   */
  forceRetry(taskId: string): { success: boolean; error?: string } {
    return this.stateService.forceRetry(taskId);
  }

  /**
   * Updates specific fields of a task.
   * Merges updates into existing task and persists.
   */
  updateTask(taskId: string, updates: Partial<Task>): Task | null {
    const task = this.getTask(taskId);
    if (!task) return null;

    // Merge updates
    const updatedTask: Task = {
      ...task,
      ...updates,
      // Deep merge 'to' if provided, otherwise keep existing
      to: updates.to ? { ...task.to, ...updates.to } : task.to
    };

    try {
      this.repo.update(updatedTask);
      console.log(`[Queue] Task ${taskId} manually updated`);
      return updatedTask;
    } catch (e: unknown) {
      console.error(`[Queue] Failed to update task ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

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
    // Emit update so UI receives the message live
    const messages = this.messageService.getMessages(taskId);
    emitTaskUpdated(taskId, { messages });
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

  findAndReserveAgent(task: Task): string | null {
    return this.matchingService.reserveAgentForTask(task);
  }

  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    workspaceContext?: WorkspaceContext,
    timeoutMs: number = 290000
  ): Promise<WaitResult> {
    return this.pollingService.waitForTask(agentId, capabilities, workspaceContext, timeoutMs);
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    return this.stateService.ackTask(taskId, agentId);
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

  /**
   * Triggers an immediate scheduler cycle.
   * Called when an agent becomes available to minimize assignment latency.
   */
  triggerImmediateAssignment(): void {
    this.scheduler.runCycle();
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
  getWaitingAgents(): Map<string, { capabilities: StandardCapability[]; workspaceContext?: WorkspaceContext }> {
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

  /** Checks whether a specific agent is currently waiting (from DB) */
  isAgentWaiting(agentId: string): boolean {
    return this.persistence.isAgentWaiting(agentId);
  }

  /** Get all agents that are currently assigned tasks */
  getBusyAgentIds(): string[] {
    const busyStatus: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK'];
    return [...new Set(
      this.repo.getActive()
        .filter(t => busyStatus.includes(t.status) && t.to.agentId)
        .map(t => t.to.agentId as string)
    )];
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

  /** Get task's last progress timestamp from database - implements ISchedulerQueue */
  getTaskLastProgress(taskId: string): number | undefined {
    try {
      const row = this.db.prepare('SELECT lastProgressAt FROM tasks WHERE id = ?').get(taskId) as any;
      return row?.lastProgressAt ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Update task's last progress timestamp - called on progress updates */
  touchTask(taskId: string): void {
    try {
      this.db.prepare('UPDATE tasks SET lastProgressAt = ? WHERE id = ?').run(Date.now(), taskId);
    } catch (e: unknown) {
      console.error(`[Queue] Failed to touch task ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  clear(): void {
    try {
      this.repo.clearAll();
      // Also clear waiting agents
      this.persistence.resetWaitingAgents();
      console.log('[Queue] Cleared all tasks');
    } catch (e: unknown) {
      console.error(`[Queue] Failed to clear tasks: ${e instanceof Error ? e.message : String(e)}`);
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
    } catch (e: unknown) {
      console.error(`[Queue] Failed to update task ${task.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

}
