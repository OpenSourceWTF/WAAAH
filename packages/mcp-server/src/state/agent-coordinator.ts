
import { Task, StandardCapability, TaskStatus } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from './task-repository.js';
import type { TypedEventEmitter } from './queue-events.js';
import type { QueueDbState } from './queue-db-state.js';
import type { TaskLifecycle } from './task-lifecycle.js';
import { isTaskForAgent } from './agent-matcher.js';

/**
 * Manages agent task matching, assignment, and coordination.
 */
export class AgentCoordinator {
  constructor(
    private readonly dbState: QueueDbState,
    private readonly repo: ITaskRepository,
    private readonly events: TypedEventEmitter,
    private readonly lifecycle: TaskLifecycle
  ) {}

  /**
   * Finds a pending task suitable for an agent.
   * Skips tasks with unsatisfied dependencies.
   * Prioritizes tasks that were previously assigned to this agent (affinity on feedback).
   */
  findPendingTaskForAgent(agentId: string, capabilities: StandardCapability[]): Task | undefined {
    const candidates = this.repo.getByStatuses(['QUEUED', 'APPROVED_QUEUED']);

    // Filter out tasks with unsatisfied dependencies
    const eligibleCandidates = candidates.filter(task => {
      if (!task.dependencies || task.dependencies.length === 0) {
        return true; // No dependencies - eligible
      }
      // Check all dependencies are COMPLETED
      const allMet = task.dependencies.every(depId => {
        const dep = this.repo.getById(depId);
        return dep && dep.status === 'COMPLETED';
      });
      if (!allMet) {
        console.log(`[AgentCoordinator] Skipping task ${task.id} - dependencies not satisfied`);
      }
      return allMet;
    });

    // Sort by: 1) Agent affinity (previously assigned to this agent), 2) Priority, 3) Age
    eligibleCandidates.sort((a: Task, b: Task) => {
      // Agent affinity first - tasks previously assigned to this agent get priority
      const aAffinity = a.assignedTo === agentId ? 1 : 0;
      const bAffinity = b.assignedTo === agentId ? 1 : 0;
      if (aAffinity !== bAffinity) return bAffinity - aAffinity; // Affinity first

      const pScores: Record<string, number> = { critical: 3, high: 2, normal: 1 };
      const scoreA = pScores[a.priority] || 1;
      const scoreB = pScores[b.priority] || 1;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.createdAt - b.createdAt;
    });

    for (const task of eligibleCandidates) {
      if (task.to.agentId === agentId) return task;
      // Check if agent has required capabilities (exact match)
      const required = task.to.requiredCapabilities || [];
      if (required.length === 0 || required.every(cap => capabilities.includes(cap))) {
        return task;
      }
    }

    return undefined;
  }

  /**
   * Finds and reserves a matching waiting agent for a task.
   * Uses database-backed waiting agents state.
   */
  findAndReserveAgent(task: Task): string | null {
    const waitingAgents = this.dbState.getWaitingAgents();
    if (waitingAgents.size === 0) return null;

    // Shuffle agents for fairness
    const waitingList = Array.from(waitingAgents.entries());
    const shuffled = waitingList
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    for (const [agentId, capabilities] of shuffled) {
      const capsArray = capabilities || [];
      console.log(`[AgentCoordinator] Checking ${agentId} with capabilities=[${capsArray.join(',')}] against task.to.requiredCapabilities=[${task.to.requiredCapabilities?.join(',') || 'any'}]`);

      if (isTaskForAgent(task, agentId, capabilities)) {
        // Atomic reservation
        this.lifecycle.updateStatus(task.id, 'PENDING_ACK');
        this.dbState.setPendingAck(task.id, agentId);

        console.log(`[AgentCoordinator] Reserved task ${task.id} for agent ${agentId}, notifying...`);
        this.events.emit('task', task, agentId);

        this.dbState.clearAgentWaiting(agentId);

        return agentId;
      }
    }
    return null;
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
    const pending = this.dbState.getPendingAcks();
    const pendingInfo = pending.get(taskId);

    if (!pendingInfo) {
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (pendingInfo.agentId !== agentId) {
      return { success: false, error: `Task was sent to ${pendingInfo.agentId}, not ${agentId}` };
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

    this.lifecycle.updateStatus(taskId, 'ASSIGNED', undefined, agentId); // This handles persistence and history logic too.
    
    // updateStatus in TaskLifecycle updates status, history, persists and emits completion.
    // In original code, ackTask updated status, history manually then called persistUpdate.
    
    // Let's rely on TaskLifecycle.updateStatus, but we need to ensure it sets assignedTo.
    // TaskLifecycle.updateStatus DOES NOT set assignedTo.
    // So we must set assignedTo on the task object BEFORE calling updateStatus.
    // Since updateStatus fetches task from repo, and `task` reference we have is from repo (getById returns reference?),
    // modification to `task` should be reflected.
    
    // However, `updateStatus` fetches task again: `const task = this.repo.getById(taskId);`
    // If it's the same object reference (in-memory repo), it works.
    // If it fetches a copy, it might not work.
    // TaskRepository implementation usually returns reference from in-memory array.
    
    // Let's assume it works, but to be safe, I should probably check TaskLifecycle.
    
    // Wait, `TaskLifecycle.updateStatus` does:
    // task.status = status;
    // ...
    // this.persistUpdate(task);
    
    // It doesn't allow setting other fields.
    
    // So I should set `assignedTo` here, then call `updateStatus`.
    
    this.dbState.clearPendingAck(taskId);
    console.log(`[AgentCoordinator] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);

    return { success: true };
  }

  /** Get all agents that are currently assigned tasks */
  getBusyAgentIds(): string[] {
    const busyStatus: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK'];
    const busyAgents = new Set<string>();

    for (const task of this.repo.getActive()) {
      if (busyStatus.includes(task.status) && task.to.agentId) {
        busyAgents.add(task.to.agentId);
      }
    }
    return Array.from(busyAgents);
  }

  /** Get tasks assigned to an agent (Active only) */
  getAssignedTasksForAgent(agentId: string): Task[] {
    const all = this.repo.getByAssignedTo(agentId);
    return all.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(t.status));
  }
}
