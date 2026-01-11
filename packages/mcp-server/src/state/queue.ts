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
 * - Delegates lifecycle to TaskLifecycleService
 * - Delegates queries to TaskQueryService
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

  /** Service for message handling */
  private readonly messageService: MessageService;

  /** Service for polling operations */
  private readonly pollingService: PollingService;

  /** Service for task lifecycle management */
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

    // Initialize lifecycle service
    this.lifecycleService = new TaskLifecycleService(
      this.repo,
      this.matchingService,
      this.persistence
    );

    // Initialize query service
    this.queryService = new TaskQueryService(this.repo, this.persistence);

    // Initialize scheduler with this queue (implements ISchedulerQueue directly)
    this.scheduler = new HybridScheduler(this);

    // Reset any PENDING_ACK tasks and waiting agents from previous run
    this.pollingService.resetStaleState();
  }

  // ===== Task Lifecycle (Delegated) =====

  /**
   * Enqueues a new task into the system.
   */
  enqueue(task: Task): void {
    try {
      const reservedAgentId = this.lifecycleService.enqueue(task);
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
    const task = this.lifecycleService.updateStatus(taskId, status, response);
    if (task && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(status)) {
      this.emit('completion', task);
      console.log(`[Queue] Emitted completion event for task ${taskId} (${status})`);
    }
  }

  /**
   * Cancels a task if it is not already in a terminal state.
   */
  cancelTask(taskId: string): { success: boolean; error?: string } {
    return this.lifecycleService.cancelTask(taskId);
  }

  /**
   * Forces a retry of a task by resetting its status to 'QUEUED'.
   */
  forceRetry(taskId: string): { success: boolean; error?: string } {
    return this.lifecycleService.forceRetry(taskId);
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

  findAndReserveAgent(task: Task): string | null {
    return this.matchingService.reserveAgentForTask(task);
  }

  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    timeoutMs: number = 290000
  ): Promise<WaitResult> {
    return this.pollingService.waitForTask(agentId, capabilities, timeoutMs);
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    return this.lifecycleService.ackTask(taskId, agentId);
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

  mapRowToTask(row: any): Task {
    // Should this be delegated? 
    // It seems to be a helper specific to DB rows. 
    // Maybe move to TaskRepository?
    // But for now, keeping it here to avoid breaking callers if they rely on it being on Queue instance 
    // (though it's public, so they might).
    // Actually, it's public.
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