/**
 * Hybrid Task Scheduler
 *
 * Manages the periodic task assignment and cleanup cycle:
 * - Requeues tasks stuck in PENDING_ACK (ACK timeout)
 * - Unblocks tasks with satisfied dependencies
 * - Assigns QUEUED tasks to waiting agents
 * - Rebalances tasks from offline agents
 *
 * @module state/scheduler
 */

import type { Task } from '@opensourcewtf/waaah-types';
import { ACK_TIMEOUT_MS, SCHEDULER_INTERVAL_MS, STALE_TASK_TIMEOUT_MS } from './constants.js';
import { areDependenciesMet } from './services/task-lifecycle-service.js';
import { sortTasksByPriority } from './agent-matcher.js';
import type { ISchedulerQueue } from './interfaces.js';

// Re-export interface for backwards compatibility
export type { ISchedulerQueue } from './interfaces.js';

/**
 * HybridScheduler manages periodic task assignment and queue maintenance.
 */
export class HybridScheduler {
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private queue: ISchedulerQueue) { }

  /**
   * Starts the scheduler loop.
   * @param intervalMs - Interval between scheduler cycles (default: 10s)
   */
  start(intervalMs: number = SCHEDULER_INTERVAL_MS): void {
    if (this.intervalHandle) return;

    console.log('[Scheduler] Starting Hybrid Task Scheduler...');
    this.intervalHandle = setInterval(() => {
      this.runCycle();
    }, intervalMs);
  }

  /**
   * Stops the scheduler loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      console.log('[Scheduler] Stopped.');
    }
  }

  /**
   * Runs a single scheduler cycle.
   * Called automatically by the interval, or can be invoked manually for testing.
   */
  runCycle(): void {
    try {
      this.requeueStuckTasks();
      this.checkBlockedTasks();
      this.assignPendingTasks();
      this.rebalanceStaleTasks();
    } catch (e: unknown) {
      console.error(`[Scheduler] Cycle error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Step 1: Requeue tasks stuck in PENDING_ACK for too long
   */
  private requeueStuckTasks(): void {
    const now = Date.now();
    const pendingAcks = this.queue.getPendingAcks();

    for (const [taskId, pending] of pendingAcks.entries()) {
      if (now - pending.sentAt > ACK_TIMEOUT_MS) {
        console.log(`[Scheduler] Task ${taskId} stuck in PENDING_ACK for >30s. Requeuing...`);
        this.queue.forceRetry(taskId);
      }
    }
  }

  /**
   * Step 1.5: Check BLOCKED tasks for satisfied dependencies
   * Only unblocks tasks that have dependencies AND all dependencies are complete.
   * Tasks blocked for clarification/decision reasons (no dependencies) must be
   * explicitly unblocked via answer_task.
   */
  private checkBlockedTasks(): void {
    const blockedTasks = this.queue.getByStatus('BLOCKED');
    for (const task of blockedTasks) {
      this.tryUnblockTask(task);
    }
  }

  /** Check if a blocked task can be unblocked due to dependency completion */
  private tryUnblockTask(task: Task): void {
    // Only check tasks with dependencies - others need explicit unblock
    if (!task.dependencies?.length) return;

    const getTaskFn = (id: string) => this.queue.getTask(id) || this.queue.getTaskFromDB(id);
    if (areDependenciesMet(task, getTaskFn)) {
      console.log(`[Queue] Task ${task.id} dependencies met. Unblocking -> QUEUED`);
      this.queue.updateStatus(task.id, 'QUEUED');
    }
  }

  /**
   * Step 2: Proactively assign ALL QUEUED tasks to waiting agents
   */
  private assignPendingTasks(): void {
    const queuedTasks = this.queue.getByStatuses(['QUEUED', 'APPROVED_QUEUED']);
    if (queuedTasks.length === 0) return;

    // Sort by priority and filter by dependencies using shared utilities
    const sortedTasks = sortTasksByPriority(queuedTasks);
    const getTaskFn = (id: string) => this.queue.getTask(id) || this.queue.getTaskFromDB(id);
    const assignableTasks = sortedTasks.filter(task => areDependenciesMet(task, getTaskFn));
    if (assignableTasks.length === 0) return;

    const waitingAgents = this.queue.getWaitingAgents();
    this.logAssignmentStatus(assignableTasks.length, queuedTasks.length, waitingAgents);

    for (const task of assignableTasks) {
      if (waitingAgents.size === 0) break;
      this.tryAssignTask(task);
    }
  }

  /** Log assignment status for debugging */
  private logAssignmentStatus(assignable: number, total: number, agents: Map<string, any>): void {
    console.log(`[Scheduler] assignPendingTasks: ${assignable} assignable (${total} total queued), ${agents.size} waiting`);
    if (agents.size > 0) {
      const agentList = Array.from(agents.entries()).map(([id, d]) => `${id}(${d.capabilities.join(',')})`).join(', ');
      console.log(`[Scheduler] Waiting agents: ${agentList}`);
    }
  }

  /** Attempt to assign a single task to an agent */
  private tryAssignTask(task: Task): void {
    const reservedAgentId = this.queue.findAndReserveAgent(task);
    if (reservedAgentId) {
      console.log(`[Scheduler] ✓ Assigned task ${task.id} to agent ${reservedAgentId}`);
    } else {
      console.log(`[Scheduler] ✗ No matching agent for task ${task.id} (to=${JSON.stringify(task.to)})`);
    }
  }

  /**
   * Step 3: Rebalance stale tasks (no activity for STALE_TASK_TIMEOUT_MS)
   * Uses task-level activity tracking instead of agent online status.
   */
  private rebalanceStaleTasks(): void {
    const activeTasks = this.queue.getByStatuses(['IN_PROGRESS', 'ASSIGNED']);
    if (activeTasks.length === 0) return;

    const now = Date.now();
    for (const task of activeTasks) {
      this.checkTaskStaleness(task, now);
    }
  }

  /** Check if task is stale and requeue if necessary */
  private checkTaskStaleness(task: Task, now: number): void {
    const lastProgress = this.queue.getTaskLastProgress(task.id);
    const lastActivity = lastProgress ?? task.createdAt ?? now;
    if (now - lastActivity > STALE_TASK_TIMEOUT_MS) {
      console.log(`[Scheduler] Task ${task.id} stale (no activity for 30+ min). Requeuing...`);
      this.queue.forceRetry(task.id);
    }
  }
}

export { SCHEDULER_INTERVAL_MS, ACK_TIMEOUT_MS, STALE_TASK_TIMEOUT_MS };
