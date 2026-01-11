import { Task, TaskStatus } from '@opensourcewtf/waaah-types';
import { type ITaskRepository } from '../task-repository.js';
import { AgentMatchingService } from './agent-matching-service.js';
import { QueuePersistence } from '../persistence/queue-persistence.js';

export class TaskLifecycleService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly matchingService: AgentMatchingService,
    private readonly persistence: QueuePersistence
  ) {}

  enqueue(task: Task): string | null {
    // Check dependencies before enqueueing
    if (task.dependencies && task.dependencies.length > 0) {
      const allMet = task.dependencies.every(depId => {
        const dep = this.repo.getById(depId);
        return dep && dep.status === 'COMPLETED';
      });

      if (!allMet) {
        task.status = 'BLOCKED';
        console.log(`[Lifecycle] Task ${task.id} BLOCKED by dependencies: ${task.dependencies.join(', ')}`);
      }
    }

    try {
      this.repo.insert(task);
      console.log(`[Lifecycle] Enqueued task: ${task.id} (${task.status})`);

      // ATOMIC ASSIGNMENT: Find and reserve agent synchronously
      const reservedAgentId = this.matchingService.reserveAgentForTask(task);
      return reservedAgentId;
    } catch (e: any) {
      console.error(`[Lifecycle] Failed to persist task ${task.id}: ${e.message}`);
      throw e;
    }
  }

  updateStatus(taskId: string, status: TaskStatus, response?: any): Task | null {
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

      this.repo.update(task);
      return task;
    }
    return null;
  }

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
    this.persistence.clearPendingAck(taskId);

    console.log(`[Lifecycle] Task ${taskId} cancelled by admin`);
    return { success: true };
  }

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

    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);

    console.log(`[Lifecycle] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const pendingAck = this.persistence.getPendingAck(taskId);

    if (!pendingAck) {
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (pendingAck.agentId !== agentId) {
      return { success: false, error: `Task was sent to ${pendingAck.agentId}, not ${agentId}` };
    }

    const task = this.repo.getById(taskId);
    if (!task) return { success: false, error: 'Task not found' };

    task.assignedTo = agentId;
    task.status = 'ASSIGNED';

    if (!task.history) task.history = [];
    task.history.push({
      timestamp: Date.now(),
      status: 'ASSIGNED',
      agentId: agentId,
      message: `Task assigned to ${agentId}`
    });

    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);
    console.log(`[Lifecycle] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);

    return { success: true };
  }

  resetStaleState(): void {
    try {
      // Reset PENDING_ACK tasks to QUEUED
      const stale = this.repo.getByStatus('PENDING_ACK');
      for (const task of stale) {
        console.log(`[Lifecycle] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.repo.updateStatus(task.id, 'QUEUED');
        this.persistence.clearPendingAck(task.id);
      }

      // Clear all waiting agents
      this.persistence.resetWaitingAgents();

      console.log(`[Lifecycle] Loaded ${this.repo.getActive().length} active tasks from DB`);
    } catch {
      console.log('[Lifecycle] Database not ready, skipping stale state reset');
    }
  }
}
