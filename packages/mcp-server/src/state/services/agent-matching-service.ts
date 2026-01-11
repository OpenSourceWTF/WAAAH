import {
  Task,
  TaskStatus,
  StandardCapability
} from '@opensourcewtf/waaah-types';
import { QueuePersistence } from '../persistence/queue-persistence.js';
import { ITaskRepository } from '../persistence/task-repository.js';
import { isTaskForAgent, findBestAgent, WaitingAgent } from '../agent-matcher.js';
import { areDependenciesMet } from './task-lifecycle-service.js';

export class AgentMatchingService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly persistence: QueuePersistence
  ) { }

  /**
   * Finds a pending task suitable for an agent.
   * Skips tasks with unsatisfied dependencies.
   * Prioritizes tasks that were previously assigned to this agent (affinity on feedback).
   */
  findPendingTaskForAgent(agentId: string, capabilities: StandardCapability[]): Task | undefined {
    const candidates = this.repo.getByStatuses(['QUEUED', 'APPROVED_QUEUED']);

    // Filter out tasks with unsatisfied dependencies
    const getTaskFn = (id: string) => this.repo.getById(id) ?? undefined;
    const eligibleCandidates = candidates.filter(task => areDependenciesMet(task, getTaskFn));

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
   * Uses scored matching (workspace affinity + capability match + agent hint).
   * Returns the agentId if reserved, null otherwise.
   */
  reserveAgentForTask(task: Task): string | null {
    const waitingAgentsMap = this.persistence.getWaitingAgents();
    if (waitingAgentsMap.size === 0) return null;

    // Convert to WaitingAgent[] format for findBestAgent
    const waitingAgents: WaitingAgent[] = Array.from(waitingAgentsMap.entries()).map(([agentId, capabilities]) => ({
      agentId,
      capabilities: capabilities || [],
      waitingSince: Date.now() // TODO: Track actual wait start time in persistence
    }));

    // Use scored matching instead of random shuffle
    const bestAgent = findBestAgent(task, waitingAgents);
    if (!bestAgent) {
      console.log(`[AgentMatching] No eligible agent for task ${task.id}`);
      return null;
    }

    // Atomic reservation
    // 1. Update status
    task.status = 'PENDING_ACK';
    if (!task.history) task.history = [];
    task.history.push({
      timestamp: Date.now(),
      status: 'PENDING_ACK',
      agentId: undefined,
      message: `Reserved for agent ${bestAgent.agentId} (scored match)`
    });
    this.repo.update(task);

    // 2. Set pending ACK
    this.persistence.setPendingAck(task.id, bestAgent.agentId);

    // 3. Clear waiting state
    this.persistence.clearAgentWaiting(bestAgent.agentId);

    return bestAgent.agentId;
  }
}
