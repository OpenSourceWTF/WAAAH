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

import type { Task, TaskStatus } from '@opensourcewtf/waaah-types';
import { ACK_TIMEOUT_MS, SCHEDULER_INTERVAL_MS, ORPHAN_TIMEOUT_MS } from './constants.js';

/**
 * Interface for the task queue operations needed by the scheduler.
 */
export interface ISchedulerQueue {
  /** Get pending ACKs map */
  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }>;
  /** Get waiting agents map (agentId -> capabilities) */
  getWaitingAgents(): Map<string, import('@opensourcewtf/waaah-types').StandardCapability[]>;
  /** Force retry a task (reset to QUEUED) */
  forceRetry(taskId: string): { success: boolean; error?: string };
  /** Update task status */
  updateStatus(taskId: string, status: TaskStatus): void;
  /** Find and reserve a matching agent for a task */
  findAndReserveAgent(task: Task): string | null;
  /** Get task by ID (from memory or DB) */
  getTask(taskId: string): Task | undefined;
  getTaskFromDB(taskId: string): Task | undefined;
  /** Get tasks by status */
  getByStatus(status: TaskStatus): Task[];
  getByStatuses(statuses: TaskStatus[]): Task[];
  /** Get busy agent IDs */
  getBusyAgentIds(): string[];
  /** Get tasks assigned to an agent */
  getAssignedTasksForAgent(agentId: string): Task[];
  /** Database access for agent staleness check */
  getAgentLastSeen(agentId: string): number | undefined;
}

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
      this.rebalanceOrphanedTasks();
    } catch (e: any) {
      console.error(`[Scheduler] Cycle error: ${e.message}`);
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
      // Only check tasks that have dependencies - others are blocked for non-dependency reasons
      if (!task.dependencies || task.dependencies.length === 0) {
        // Task is blocked for clarification/decision - leave it alone
        continue;
      }

      const allMet = task.dependencies.every(depId => {
        const dep = this.queue.getTask(depId) || this.queue.getTaskFromDB(depId);
        return dep && dep.status === 'COMPLETED';
      });

      if (allMet) {
        console.log(`[Queue] Task ${task.id} dependencies met. Unblocking -> QUEUED`);
        this.queue.updateStatus(task.id, 'QUEUED');
      }
    }
  }

  /**
   * Step 2: Proactively assign ALL QUEUED tasks to waiting agents
   */
  private assignPendingTasks(): void {
    const queuedTasks = this.queue.getByStatuses(['QUEUED', 'APPROVED_QUEUED'])
      .sort((a: Task, b: Task) => {
        const pScores: Record<string, number> = { critical: 3, high: 2, normal: 1 };
        const scoreA = pScores[a.priority] || 1;
        const scoreB = pScores[b.priority] || 1;
        if (scoreA !== scoreB) return scoreB - scoreA; // Higher priority first
        return a.createdAt - b.createdAt; // Older first
      });

    if (queuedTasks.length === 0) return;

    // Filter out tasks with unmet dependencies
    const assignableTasks = queuedTasks.filter(task => {
      if (!task.dependencies || task.dependencies.length === 0) return true;
      const allMet = task.dependencies.every(depId => {
        const dep = this.queue.getTask(depId) || this.queue.getTaskFromDB(depId);
        return dep && dep.status === 'COMPLETED';
      });
      if (!allMet) {
        console.log(`[Scheduler] Task ${task.id} has unmet dependencies - skipping until deps complete`);
      }
      return allMet;
    });

    if (assignableTasks.length === 0) return;

    const waitingAgents = this.queue.getWaitingAgents();
    console.log(`[Scheduler] assignPendingTasks: ${assignableTasks.length} assignable (${queuedTasks.length} total queued), ${waitingAgents.size} waiting`);

    if (waitingAgents.size > 0) {
      const agents = Array.from(waitingAgents.entries()).map(([id, role]) => `${id}(${role})`).join(', ');
      console.log(`[Scheduler] Waiting agents: ${agents}`);
    }

    for (const task of assignableTasks) {
      if (waitingAgents.size === 0) {
        console.log(`[Scheduler] No waiting agents remaining. Stopping.`);
        break;
      }

      const reservedAgentId = this.queue.findAndReserveAgent(task);

      if (reservedAgentId) {
        console.log(`[Scheduler] ✓ Assigned task ${task.id} to agent ${reservedAgentId}`);
      } else {
        console.log(`[Scheduler] ✗ No matching agent for task ${task.id} (to=${JSON.stringify(task.to)})`);
      }
    }
  }

  /**
   * Step 3: Rebalance tasks from offline agents
   */
  private rebalanceOrphanedTasks(): void {
    const busyAgentIds = this.queue.getBusyAgentIds();
    if (busyAgentIds.length === 0) return;

    const now = Date.now();
    const offlineAgents = new Set<string>();

    for (const agentId of busyAgentIds) {
      const lastSeen = this.queue.getAgentLastSeen(agentId);
      if (!lastSeen || (now - lastSeen > ORPHAN_TIMEOUT_MS)) {
        offlineAgents.add(agentId);
      }
    }

    if (offlineAgents.size === 0) return;

    for (const agentId of offlineAgents) {
      const tasks = this.queue.getAssignedTasksForAgent(agentId);
      for (const task of tasks) {
        console.log(`[Scheduler] Agent ${agentId} appears offline/orphaned. Requeuing task ${task.id}`);
        this.queue.forceRetry(task.id);
      }
    }
  }
}

export { SCHEDULER_INTERVAL_MS, ACK_TIMEOUT_MS, ORPHAN_TIMEOUT_MS };
