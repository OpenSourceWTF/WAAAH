import {
  Task,
  TaskStatus,
  StandardCapability
} from '@opensourcewtf/waaah-types';
import { QueuePersistence } from '../persistence/queue-persistence.js';
import { ITaskRepository } from '../task-repository.js';
import { isTaskForAgent } from '../agent-matcher.js';

export class AgentMatchingService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly persistence: QueuePersistence
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
      // Note: We need access to getTask logic. Ideally repo has getById.
      const allMet = task.dependencies.every(depId => {
        const dep = this.repo.getById(depId);
        return dep && dep.status === 'COMPLETED';
      });
      if (!allMet) {
        console.log(`[AgentMatching] Skipping task ${task.id} - dependencies not satisfied`);
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
   * Returns the agentId if reserved, null otherwise.
   */
  reserveAgentForTask(task: Task): string | null {
    const waitingAgents = this.persistence.getWaitingAgents();
    if (waitingAgents.size === 0) return null;

    // Shuffle agents for fairness
    const waitingList = Array.from(waitingAgents.entries());
    const shuffled = waitingList
      .map(value => ({ value, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ value }) => value);

    for (const [agentId, capabilities] of shuffled) {
      const capsArray = capabilities || [];
      // console.log(`[AgentMatching] Checking ${agentId} with capabilities=[${capsArray.join(',')}] against task.to.requiredCapabilities=[${task.to.requiredCapabilities?.join(',') || 'any'}]`);

      if (isTaskForAgent(task, agentId, capabilities)) {
        // Atomic reservation
        // We perform the updates directly here to ensure atomicity logic is encapsulated
        
        // 1. Update status
        task.status = 'PENDING_ACK';
        if (!task.history) task.history = [];
        task.history.push({
            timestamp: Date.now(),
            status: 'PENDING_ACK',
            agentId: undefined,
            message: `Reserved for agent ${agentId}`
        });
        this.repo.update(task);

        // 2. Set pending ACK
        this.persistence.setPendingAck(task.id, agentId);

        // 3. Clear waiting state
        this.persistence.clearAgentWaiting(agentId);

        return agentId;
      }
    }
    return null;
  }
}
