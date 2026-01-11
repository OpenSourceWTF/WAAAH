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
    const task = this.repo.getById(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: 'Task is not in PENDING_ACK state' };
    }

    const pendingAck = this.persistence.getPendingAck(taskId);
    if (!pendingAck || pendingAck.agentId !== agentId) {
      return { success: false, error: `ACK failed: Expected agent ${pendingAck?.agentId} but got ${agentId}` };
    }

    // Success: Transition to ASSIGNED
    task.assignedTo = agentId;
    task.to.agentId = agentId; // Update target agent explicitly
    this.repo.update(task); // Persist assignment first
    
    // Clear pending ACK flags
    this.persistence.clearPendingAck(taskId);
    
    // Update status using updateStatus to handle history/logging
    this.updateStatus(taskId, 'ASSIGNED');

    console.log(`[Lifecycle] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);
    return { success: true };
  }
}
