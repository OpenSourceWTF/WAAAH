import { Task, TaskStatus } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from '../task-repository.js';
import type { AgentMatchingService } from './agent-matching-service.js';
import type { QueuePersistence } from '../persistence/queue-persistence.js';

type ActionResult = { success: boolean; error?: string };

const TERMINAL_STATES: TaskStatus[] = ['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
const RETRYABLE_STATES: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK', 'CANCELLED', 'FAILED', 'BLOCKED'];

const addHistoryEntry = (task: Task, status: TaskStatus, message: string, agentId?: string) => {
  task.history ??= [];
  task.history.push({ timestamp: Date.now(), status, agentId, message });
};

const fail = (error: string): ActionResult => ({ success: false, error });
const ok = (): ActionResult => ({ success: true });

export class TaskLifecycleService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly matchingService: AgentMatchingService,
    private readonly persistence: QueuePersistence
  ) { }

  private checkDependencies(task: Task): boolean {
    return !task.dependencies?.length ||
      task.dependencies.every(depId => this.repo.getById(depId)?.status === 'COMPLETED');
  }

  enqueue(task: Task): string | null {
    const depsOk = this.checkDependencies(task);
    task.status = depsOk ? task.status : 'BLOCKED';
    !depsOk && console.log(`[Lifecycle] Task ${task.id} BLOCKED by dependencies`);

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
    if (!task) return null;

    task.status = status;
    response && (task.response = response, task.completedAt = Date.now());

    addHistoryEntry(task, status, response ? 'Status updated with response' : `Status changed to ${status}`, task.assignedTo);
    this.repo.update(task);
    return task;
  }

  cancelTask(taskId: string): ActionResult {
    const task = this.repo.getById(taskId);
    if (!task) return fail('Task not found');
    if (TERMINAL_STATES.includes(task.status)) return fail(`Task is already ${task.status}`);

    this.updateStatus(taskId, 'CANCELLED');
    this.persistence.clearPendingAck(taskId);
    console.log(`[Lifecycle] Task ${taskId} cancelled by admin`);
    return ok();
  }

  forceRetry(taskId: string): ActionResult {
    const task = this.repo.getById(taskId);
    if (!task) return fail('Task not found');
    if (!RETRYABLE_STATES.includes(task.status)) return fail(`Task status ${task.status} is not retryable`);

    // Preserve any stored diff across retries
    const preservedDiff = (task.response as any)?.artifacts?.diff;
    task.assignedTo = task.completedAt = undefined;
    task.response = preservedDiff ? { artifacts: { diff: preservedDiff } } : undefined;
    task.status = 'QUEUED';
    addHistoryEntry(task, 'QUEUED', 'Force-retried by admin');
    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);
    console.log(`[Lifecycle] Task ${taskId} force-retried by admin`);
    return ok();
  }

  ackTask(taskId: string, agentId: string): ActionResult {
    const task = this.repo.getById(taskId);
    if (!task) return fail('Task not found');
    if (task.status !== 'PENDING_ACK') return fail('Task is not in PENDING_ACK state');

    const pendingAck = this.persistence.getPendingAck(taskId);
    if (pendingAck?.agentId !== agentId) return fail(`ACK failed: Expected agent ${pendingAck?.agentId} but got ${agentId}`);

    task.assignedTo = task.to.agentId = agentId;
    this.repo.update(task);
    this.persistence.clearPendingAck(taskId);
    this.updateStatus(taskId, 'ASSIGNED');
    console.log(`[Lifecycle] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);
    return ok();
  }
}
