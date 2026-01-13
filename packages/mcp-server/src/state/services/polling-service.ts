import { Task, StandardCapability, WorkspaceContext } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from '../persistence/task-repository.js';
import type { QueuePersistence } from '../persistence/queue-persistence.js';
import type { AgentMatchingService } from './agent-matching-service.js';
import type { IEvictionService } from '../eviction-service.js';
import type { TypedEventEmitter } from '../queue-events.js';
import type { WaitResult } from '../queue.interface.js';
import { createPollingPromise } from './polling-utils.js';

export class PollingService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly persistence: QueuePersistence,
    private readonly matchingService: AgentMatchingService,
    private readonly evictionService: IEvictionService,
    private readonly emitter: TypedEventEmitter,
    private readonly onAgentWaiting?: () => void
  ) { }

  /**
   * Waits for a task suitable for the specified agent.
   * Uses database-backed waiting state and capability-based matching.
   */
  async waitForTask(
    agentId: string,
    capabilities: StandardCapability[],
    workspaceContext?: WorkspaceContext,
    timeoutMs: number = 290000
  ): Promise<WaitResult> {
    const startTime = Date.now();
    // console.log(`[Polling] Starting waitForTask for ${agentId}`);

    // Track this agent as waiting in DB
    this.persistence.setAgentWaiting(agentId, capabilities, workspaceContext);

    // Trigger immediate scheduler cycle to minimize assignment latency (deferred to not race)
    if (this.onAgentWaiting) {
      setImmediate(() => this.onAgentWaiting?.());
    }

    // 0. Check for pending eviction (Optimistic)
    const pendingEviction = this.evictionService.popEviction(agentId);
    if (pendingEviction) {
      // console.log(`[Polling] Agent ${agentId} immediately evicted`);
      this.persistence.clearAgentWaiting(agentId);
      return pendingEviction;
    }

    // 1. Check if there are pending tasks (Optimistic)
    const match = this.matchingService.findPendingTaskForAgent(agentId, capabilities, workspaceContext);
    if (match) {
      this.persistence.clearAgentWaiting(agentId);
      // We need to update status to PENDING_ACK
      this.repo.updateStatus(match.id, 'PENDING_ACK');
      this.persistence.setPendingAck(match.id, agentId);
      return match;
    }

    // Use shared polling utility
    return createPollingPromise({
      agentId,
      emitter: this.emitter,
      timeoutMs,
      popEviction: (id) => this.evictionService.popEviction(id),
      onCleanup: () => this.persistence.clearAgentWaiting(agentId)
    });
  }

  // REMOVED: ackTask - now handled by TaskLifecycleService via queue.ackTask()
  // The duplicate implementation was dead code that bypassed event emission.

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

  /** Reset PENDING_ACK tasks and waiting agents on startup */
  resetStaleState(): void {
    try {
      // Reset PENDING_ACK tasks to QUEUED
      const stale = this.repo.getByStatus('PENDING_ACK');
      for (const task of stale) {
        console.log(`[PollingService] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.repo.updateStatus(task.id, 'QUEUED');
        this.persistence.clearPendingAck(task.id);
      }

      // Clear all waiting agents
      this.persistence.resetWaitingAgents();

      console.log(`[PollingService] Loaded ${this.repo.getActive().length} active tasks from DB`);
    } catch {
      console.log('[PollingService] Database not ready, skipping stale state reset');
    }
  }
}
