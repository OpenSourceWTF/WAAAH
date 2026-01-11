import { Task, TaskStatus } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from '../task-repository.js';
import type { AgentMatchingService } from './agent-matching-service.js';
import type { QueuePersistence } from '../persistence/queue-persistence.js';

type ActionResult = { success: boolean; error?: string };

const TERMINAL_STATES: TaskStatus[] = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
const RETRYABLE_STATES: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK', 'CANCELLED', 'FAILED'];

const addHistoryEntry = (task: Task, status: TaskStatus, message: string, agentId?: string) => {
  task.history ??= [];
  task.history.push({ timestamp: Date.now(), status, agentId, message });
};

export class TaskLifecycleService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly matchingService: AgentMatchingService,
    private readonly persistence: QueuePersistence
  ) { }

  private checkDependencies(task: Task): boolean {
    return (task.dependencies?.length ?? 0) === 0 ||
      task.dependencies!.every(depId => {
        const dep = this.repo.getById(depId);
        return dep?.status === 'COMPLETED';
      });
  }

  enqueue(task: Task): string | null {
    const depsOk = this.checkDependencies(task);
    if (!depsOk) {
      task.status = 'BLOCKED';
      console.log(`[Lifecycle] Task ${task.id} BLOCKED by dependencies`);
    }

    try {
      this.repo.insert(task);
      console.log(`[Lifecycle] Enqueued task: ${task.id} (${task.status})`);
      return this.matchingService.reserveAgentForTask(task);
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
      
      const message = response ? 'Status updated with response' : `Status changed to ${status}`;
      addHistoryEntry(task, status, message, task.assignedTo);
      this.repo.update(task);
    }
    
    return task;
  }

  cancelTask(taskId: string): ActionResult {
    const task = this.repo.getById(taskId);
    
    if (!task) {
      return { success: false, error: 'Task not found' };
    }
    
    if (TERMINAL_STATES.includes(task.status)) {
      return { success: false, error: `Task is already ${task.status}` };
    }
    
    this.updateStatus(taskId, 'CANCELLED');
    this.persistence.clearPendingAck(taskId);
    console.log(`[Lifecycle] Task ${taskId} cancelled by admin`);
    
    return { success: true };
  }

  forceRetry(taskId: string): ActionResult {
    const task = this.repo.getById(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }
    
    if (!RETRYABLE_STATES.includes(task.status)) {
      return { success: false, error: `Task status ${task.status} is not retryable` };
    }
    
    return this.doForceRetry(task, taskId);
  }

  private doForceRetry(task: Task, taskId: string): ActionResult {
    task.assignedTo = task.response = task.completedAt = undefined;
    task.status = 'QUEUED';
    addHistoryEntry(task, 'QUEUED', 'Force-retried by admin');
    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);
    console.log(`[Lifecycle] Task ${taskId} force-retried by admin`);
    return { success: true };
  }

  ackTask(taskId: string, agentId: string): ActionResult {
    const task = this.repo.getById(taskId);
    const pendingAck = task && this.persistence.getPendingAck(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }
    
    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: 'Task is not in PENDING_ACK state' };
    }
    
    if (pendingAck?.agentId !== agentId) {
      return { success: false, error: `ACK failed: Expected agent ${pendingAck?.agentId} but got ${agentId}` };
    }
    
    return this.doAckTask(task, taskId, agentId);
  }

  private doAckTask(task: Task, taskId: string, agentId: string): ActionResult {
    task.assignedTo = task.to.agentId = agentId;
    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);
    this.updateStatus(taskId, 'ASSIGNED');
    console.log(`[Lifecycle] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);
    return { success: true };
  }
}
