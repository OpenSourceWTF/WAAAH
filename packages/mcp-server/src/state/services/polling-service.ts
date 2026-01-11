import {
  Task,
  StandardCapability
} from '@opensourcewtf/waaah-types';
import { ITaskRepository } from '../task-repository.js';
import { QueuePersistence } from '../persistence/queue-persistence.js';
import { AgentMatchingService } from './agent-matching-service.js';
import { IEvictionService } from '../eviction-service.js';
import { TypedEventEmitter } from '../queue-events.js';

export class PollingService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly persistence: QueuePersistence,
    private readonly matchingService: AgentMatchingService,
    private readonly evictionService: IEvictionService,
    private readonly emitter: TypedEventEmitter
  ) {}

  /**
   * Waits for a task suitable for the specified agent.
   * Uses database-backed waiting state and capability-based matching.
   */
  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    timeoutMs: number = 290000
  ): Promise<Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null> {
    // 0. Check for pending eviction FIRST
    const eviction = this.evictionService.popEviction(agentId);
    if (eviction) {
      return { controlSignal: 'EVICT', ...eviction };
    }

    // Track this agent as waiting in DB
    this.persistence.setAgentWaiting(agentId, capabilities);

    // 1. Check if there are pending tasks for this agent
    const pendingTask = this.matchingService.findPendingTaskForAgent(agentId, capabilities);
    if (pendingTask) {
      this.persistence.clearAgentWaiting(agentId);
      this.repo.updateStatus(pendingTask.id, 'PENDING_ACK');
      this.persistence.setPendingAck(pendingTask.id, agentId);
      return pendingTask;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutTimer: NodeJS.Timeout;

      const finish = (result: Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null) => {
        if (resolved) return;
        resolved = true;

        this.emitter.off('task', onTask);
        this.emitter.off('eviction', onEviction);
        if (timeoutTimer) clearTimeout(timeoutTimer);

        // Clear waiting state in DB
        this.persistence.clearAgentWaiting(agentId);

        resolve(result);
      };

      const onTask = (task: Task, intendedAgentId?: string) => {
        if (intendedAgentId === agentId) {
          finish(task);
        }
      };

      const onEviction = (targetId: string) => {
        if (targetId === agentId) {
          const ev = this.evictionService.popEviction(agentId);
          if (ev) finish({ controlSignal: 'EVICT', ...ev });
        }
      };

      this.emitter.on('task', onTask);
      this.emitter.on('eviction', onEviction);

      timeoutTimer = setTimeout(() => {
        finish(null);
      }, timeoutMs);
    });
  }

  /**
   * Acknowledges receipt of a task by an agent.
   * Uses database-backed pending ACK state.
   */
  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: `Task status is ${task.status}, expected PENDING_ACK` };
    }

    // Check pending ACK in database
    const pending = this.persistence.getPendingAck(taskId);

    if (!pending) {
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (pending.agentId !== agentId) {
      return { success: false, error: `Task was sent to ${pending.agentId}, not ${agentId}` };
    }

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
    console.log(`[PollingService] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);

    return { success: true };
  }

  async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<Task | null> {
    return new Promise((resolve) => {
      let resolved = false;

      const existingTask = this.repo.getById(taskId);
      if (existingTask && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(existingTask.status)) {
        console.log(`[PollingService] Task ${taskId} already complete (${existingTask.status})`);
        resolve(existingTask);
        return;
      }

      const onCompletion = (task: Task) => {
        if (task.id === taskId && !resolved) {
          resolved = true;
          this.emitter.off('completion', onCompletion);
          console.log(`[PollingService] Task ${taskId} completed with status ${task.status}`);
          resolve(task);
        }
      };

      this.emitter.on('completion', onCompletion);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.emitter.off('completion', onCompletion);
          console.log(`[PollingService] Wait for task ${taskId} timed out after ${timeoutMs}ms`);
          const task = this.repo.getById(taskId);
          resolve(task || null);
        }
      }, timeoutMs);
    });
  }
}
