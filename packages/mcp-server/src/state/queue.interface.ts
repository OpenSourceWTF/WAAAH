/**
 * TaskQueue Interface - Defines the public API of the TaskQueue.
 * This interface enables easier testing and potential future decomposition.
 */
import { Task, TaskStatus, AgentRole, EvictionSignal } from '@opensourcewtf/waaah-types';

/**
 * Result of task acknowledgment
 */
export interface AckResult {
  success: boolean;
  error?: string;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  total: number;
  completed: number;
}

/**
 * History query options
 */
export interface HistoryOptions {
  status?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
  search?: string;
}

/**
 * Task assignment result from waitForTask
 */
export type WaitResult = Task | EvictionSignal | null;

/**
 * Interface for the TaskQueue - the core task orchestration component.
 * Manages task lifecycle, persistence, scheduling, and agent coordination.
 */
export interface ITaskQueue {
  // ===== Task Lifecycle =====

  /** Enqueue a new task */
  enqueue(task: Task): void;

  /** Acknowledge receipt of a task */
  ackTask(taskId: string, agentId: string): AckResult;

  /** Update task status */
  updateStatus(taskId: string, status: TaskStatus, response?: unknown): void;

  /** Cancel a task */
  cancelTask(taskId: string): AckResult;

  /** Force retry a task */
  forceRetry(taskId: string): AckResult;

  /** Add a message to a task thread */
  addMessage(taskId: string, role: 'user' | 'agent' | 'system', content: string, metadata?: Record<string, unknown>): void;

  /** Get task message history */
  getMessages(taskId: string): any[];

  // ===== Agent Waiting / Long-Polling =====

  /** Wait for a task suitable for the agent */
  waitForTask(agentId: string, role: AgentRole, timeoutMs?: number): Promise<WaitResult>;

  /** Wait for a specific task to complete */
  waitForTaskCompletion(taskId: string, timeoutMs?: number): Promise<Task | null>;

  // ===== Scheduler =====

  /** Start the background scheduler */
  startScheduler(intervalMs?: number): void;

  /** Stop the scheduler */
  stopScheduler(): void;

  // ===== Eviction =====

  /** Queue an eviction signal for an agent */
  queueEviction(agentId: string, reason: string, action: 'RESTART' | 'SHUTDOWN'): void;

  /** Pop (consume) a pending eviction for an agent */
  popEviction(agentId: string): { reason: string; action: 'RESTART' | 'SHUTDOWN' } | null;

  // ===== Query =====

  /** Get a single task by ID */
  getTask(taskId: string): Task | undefined;

  /** Get all active tasks */
  getAll(): Task[];

  /** Get queue statistics */
  getStats(): QueueStats;

  /** Get task history with filters */
  getTaskHistory(options?: HistoryOptions): Task[];

  /** Get agents currently waiting for tasks */
  getWaitingAgents(): string[];

  /** Check if an agent is waiting */
  isAgentWaiting(agentId: string): boolean;

  /** Get agents with assigned tasks */
  getBusyAgentIds(): string[];

  /** Get tasks assigned to a specific agent */
  getAssignedTasksForAgent(agentId: string): Task[];

  /** Get activity logs */
  getLogs(limit?: number): unknown[];

  // ===== Utility =====

  /** Clear all tasks (use with caution) */
  clear(): void;

  // ===== Event Emitter =====

  /** Subscribe to events */
  on(event: 'task' | 'completion' | 'eviction', listener: (...args: unknown[]) => void): void;

  /** Emit an event */
  emit(event: string, ...args: unknown[]): boolean;
}
