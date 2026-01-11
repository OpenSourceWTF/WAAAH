import { Task, StandardCapability } from '@opensourcewtf/waaah-types';
import { ITaskRepository } from '../task-repository.js';
import { QueuePersistence } from '../persistence/queue-persistence.js';
import { AgentMatchingService } from './agent-matching-service.js';
import { EvictionService, EvictionSignal } from '../eviction-service.js';
import { TypedEventEmitter } from '../queue-events.js';
import { WaitResult } from '../queue.interface.js';

export class PollingService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly persistence: QueuePersistence,
    private readonly matchingService: AgentMatchingService,
    private readonly evictionService: EvictionService,
    private readonly queue: TypedEventEmitter
  ) {}

  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    timeoutMs: number = 290000
  ): Promise<WaitResult> {
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
      // We need to update status to PENDING_ACK
      // We can't call queue.updateStatus directly if we don't have access to it easily, 
      // but we have repo.
      pendingTask.status = 'PENDING_ACK';
      this.repo.updateStatus(pendingTask.id, 'PENDING_ACK');
      this.persistence.setPendingAck(pendingTask.id, agentId);
      return pendingTask;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutTimer: NodeJS.Timeout;

      const finish = (result: WaitResult) => {
        if (resolved) return;
        resolved = true;

        this.queue.off('task', onTask);
        this.queue.off('eviction', onEviction);
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

      this.queue.on('task', onTask);
      this.queue.on('eviction', onEviction);

      timeoutTimer = setTimeout(() => {
        finish(null);
      }, timeoutMs);
    });
  }

  async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<Task | null> {
    return new Promise((resolve) => {
      let resolved = false;

      const existingTask = this.repo.getById(taskId);
      if (existingTask && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(existingTask.status)) {
        console.log(`[Polling] Task ${taskId} already complete (${existingTask.status})`);
        resolve(existingTask);
        return;
      }

      const onCompletion = (task: Task) => {
        if (task.id === taskId && !resolved) {
          resolved = true;
          this.queue.off('completion', onCompletion);
          console.log(`[Polling] Task ${taskId} completed with status ${task.status}`);
          resolve(task);
        }
      };

      this.queue.on('completion', onCompletion);

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.queue.off('completion', onCompletion);
          console.log(`[Polling] Wait for task ${taskId} timed out after ${timeoutMs}ms`);
          const task = this.repo.getById(taskId);
          resolve(task || null);
        }
      }, timeoutMs);
    });
  }
}