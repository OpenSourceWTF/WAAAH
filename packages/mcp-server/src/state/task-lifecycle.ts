
import { Task, TaskStatus } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from './task-repository.js';
import type { TypedEventEmitter } from './queue-events.js';
import type { QueueDbState } from './queue-db-state.js';

/**
 * Manages task lifecycle transitions (status updates, cancellation, retries).
 */
export class TaskLifecycle {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly events: TypedEventEmitter,
    private readonly dbState: QueueDbState
  ) {}

  /**
   * Updates task status and optionally sets response.
   */
  updateStatus(taskId: string, status: TaskStatus, response?: any, assignedTo?: string): void {
    const task = this.repo.getById(taskId);
    if (task) {
      task.status = status;
      if (assignedTo) {
        task.assignedTo = assignedTo;
      }
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
        this.events.emit('completion', task);
        console.log(`[TaskLifecycle] Emitted completion event for task ${taskId} (${status})`);
      }
    }
  }

  /**
   * Cancels a task if it is not already in a terminal state.
   */
  cancelTask(taskId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const terminalStates: TaskStatus[] = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
    if (terminalStates.includes(task.status)) {
      return { success: false, error: `Task is already ${task.status}` };
    }

    this.updateStatus(taskId, 'CANCELLED');
    this.dbState.clearPendingAck(taskId);

    console.log(`[TaskLifecycle] Task ${taskId} cancelled by admin`);
    return { success: true };
  }

  /**
   * Forces a retry of a task by resetting its status to 'QUEUED'.
   */
  forceRetry(taskId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);

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
    this.dbState.clearPendingAck(taskId);

    console.log(`[TaskLifecycle] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  private persistUpdate(task: Task): void {
    try {
      this.repo.update(task);
    } catch (e: any) {
      console.error(`[TaskLifecycle] Failed to update task ${task.id}: ${e.message}`);
    }
  }
}
