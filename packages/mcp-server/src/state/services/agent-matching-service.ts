import {
  Task,
  TaskStatus,
  StandardCapability,
  WorkspaceContext
} from '@opensourcewtf/waaah-types';
import { QueuePersistence } from '../persistence/queue-persistence.js';
import { ITaskRepository } from '../persistence/task-repository.js';
import { findBestAgent, WaitingAgent, scoreAgent, sortTasksByPriority } from '../agent-matcher.js';
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
  findPendingTaskForAgent(
    agentId: string,
    capabilities: StandardCapability[],
    workspaceContext?: WorkspaceContext
  ): Task | undefined {
    const candidates = this.repo.getByStatuses(['QUEUED', 'APPROVED_QUEUED']);

    // Filter out tasks with unsatisfied dependencies
    const getTaskFn = (id: string) => this.repo.getById(id) ?? undefined;
    const eligibleCandidates = candidates.filter(task => areDependenciesMet(task, getTaskFn));

    // Use shared sorting utility from agent-matcher
    const sortedCandidates = sortTasksByPriority(eligibleCandidates, agentId);

    // Create temporary agent object for scoring
    const agent: WaitingAgent = {
      agentId,
      capabilities,
      workspaceContext,
      waitingSince: Date.now()
    };

    // Find first task this agent is eligible for (using shared scorer)
    for (const task of sortedCandidates) {
      const score = scoreAgent(task, agent);
      if (score.eligible) {
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
    const waitingAgents: WaitingAgent[] = Array.from(waitingAgentsMap.entries()).map(([agentId, data]) => ({
      agentId,
      capabilities: data.capabilities || [],
      workspaceContext: data.workspaceContext,
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
