import { Task, TaskStatus } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from '../task-repository.js';
import type { AgentMatchingService } from './agent-matching-service.js';
import type { QueuePersistence } from '../persistence/queue-persistence.js';

export class TaskLifecycleService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly matchingService: AgentMatchingService,
    private readonly persistence: QueuePersistence
  ) {}

  enqueue(task: Task): string | null {
    this.checkDependencies(task);

    try {
      this.repo.insert(task);
      console.log(`[TaskState] Enqueued task: ${task.id} (${task.status})`);

      // ATOMIC ASSIGNMENT: Find and reserve agent synchronously
      return this.matchingService.reserveAgentForTask(task);
    } catch (e: any) {
      console.error(`[TaskState] Failed to persist task ${task.id}: ${e.message}`);
      throw e;
    }
  }

  updateStatus(taskId: string, status: TaskStatus, response?: any): Task | null {
    const task = this.repo.getById(taskId);
    if (!task) return null;

    task.status = status;
    if (response) {
      task.response = response;
      task.completedAt = Date.now();
    }

    this.recordHistory(task, status, task.assignedTo, response ? 'Status updated with response' : `Status changed to ${status}`);
    this.repo.update(task);
    return task;
  }

  cancelTask(taskId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    if (this.isTerminal(task.status)) {
      return { success: false, error: `Task is already ${task.status}` };
    }

    this.updateStatus(taskId, 'CANCELLED');
    this.persistence.clearPendingAck(taskId);

    console.log(`[TaskState] Task ${taskId} cancelled by admin`);
    return { success: true };
  }

  forceRetry(taskId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    if (!this.isRetryable(task.status)) {
      return { success: false, error: `Task status ${task.status} is not retryable` };
    }

    this.resetTaskState(task);
    this.recordHistory(task, 'QUEUED', undefined, 'Force-retried by admin');
    
    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);

    console.log(`[TaskState] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: 'Task is not in PENDING_ACK state' };
    }

    const error = this.validatePendingAck(taskId, agentId);
    if (error) return { success: false, error };

    this.assignTask(task, agentId);
    return { success: true };
  }

  // Private Helpers

  private checkDependencies(task: Task): void {
    if (!task.dependencies?.length) return;

    const allMet = task.dependencies.every(depId => {
      const dep = this.repo.getById(depId);
      return dep && dep.status === 'COMPLETED';
    });

    if (!allMet) {
      task.status = 'BLOCKED';
      console.log(`[TaskState] Task ${task.id} BLOCKED by dependencies: ${task.dependencies.join(', ')}`);
    }
  }

  private recordHistory(task: Task, status: TaskStatus, agentId: string | undefined, message: string): void {
    if (!task.history) task.history = [];
    task.history.push({
      timestamp: Date.now(),
      status,
      agentId,
      message
    });
  }

  private isTerminal(status: TaskStatus): boolean {
    return ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(status);
  }

  private isRetryable(status: TaskStatus): boolean {
    return ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK', 'CANCELLED', 'FAILED'].includes(status);
  }

  private resetTaskState(task: Task): void {
    task.assignedTo = undefined;
    task.response = undefined;
    task.completedAt = undefined;
    task.status = 'QUEUED';
  }

  private validatePendingAck(taskId: string, agentId: string): string | null {
    const pendingAck = this.persistence.getPendingAck(taskId);
    if (!pendingAck || pendingAck.agentId !== agentId) {
      return `ACK failed: Expected agent ${pendingAck?.agentId} but got ${agentId}`;
    }
    return null;
  }

  private assignTask(task: Task, agentId: string): void {
    task.assignedTo = agentId;
    task.to.agentId = agentId;
    this.repo.update(task);
    
    this.persistence.clearPendingAck(task.id);
    this.updateStatus(task.id, 'ASSIGNED');

    console.log(`[TaskState] Task ${task.id} ACKed by ${agentId}, now ASSIGNED`);
  }
}