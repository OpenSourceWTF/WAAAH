/**
 * Agent Matcher
 * 
 * Handles agent-to-task matching logic using capability-based scoring:
 * - Exact capability matching (task.to.requiredCapabilities must match agent.capabilities)
 * - Workspace affinity matching (task.to.workspaceId should match agent.workspaceContext.repoId)
 * - Agent ID as hint (task.to.agentId adds score but not required)
 * 
 * Key rules:
 * - Exact capability match required (all requiredCapabilities must be in agent.capabilities)
 * - No fallback - if no match, task stays queued
 * - Workspace affinity preferred but not required
 * 
 * @module state/agent-matcher
 */

import type { Task, TaskStatus, StandardCapability, AgentIdentity, WorkspaceContext } from '@opensourcewtf/waaah-types';
import type { TypedEventEmitter } from './queue-events.js';
import { areDependenciesMet } from './services/task-lifecycle-service.js';

// ===== Configuration =====

/**
 * Scheduler configuration for scoring weights.
 */
export const SCHEDULER_CONFIG = {
  weights: {
    workspace: 0.4,      // 40% - Workspace affinity
    capabilities: 0.4,   // 40% - Capability match
    agentHint: 0.2       // 20% - Preferred agent hint
  }
};

// ===== Interfaces =====

/**
 * Waiting agent with capabilities and workspace context.
 */
export interface WaitingAgent {
  agentId: string;
  capabilities: StandardCapability[];
  workspaceContext?: WorkspaceContext;
  waitingSince: number;
}

/**
 * Interface for queue operations needed by the agent matcher.
 */
export interface IMatcherQueue extends TypedEventEmitter {
  /** Get pending ACKs map */
  pendingAcks: Map<string, { taskId: string; agentId: string; sentAt: number }>;
  /** Get waiting agents with their details */
  getWaitingAgentsWithDetails(): WaitingAgent[];
  /** Remove agent from waiting list */
  removeWaitingAgent(agentId: string): void;
  /** Add agent to waiting list */
  addWaitingAgent(agentId: string, capabilities: StandardCapability[], workspaceContext?: WaitingAgent['workspaceContext']): void;
  /** Update task status */
  updateStatus(taskId: string, status: TaskStatus): void;
  /** Get tasks by statuses */
  getByStatuses(statuses: TaskStatus[]): Task[];
  /** Pop eviction signal for agent */
  popEviction(agentId: string): { reason: string; action: 'RESTART' | 'SHUTDOWN' } | null;
  /** Get task by ID (for dependency checking) */
  getTask?(taskId: string): Task | undefined;
  getTaskFromDB?(taskId: string): Task | undefined;
}

/**
 * Result of waitForTask operation.
 */
export type WaitForTaskResult = Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null;

// ===== Scoring Functions =====

/**
 * Score result for an agent against a task.
 */
export interface AgentScore {
  agentId: string;
  score: number;
  eligible: boolean;
  workspaceScore: number;
  capabilityScore: number;
  hintScore: number;
  waitingSince: number;
}

/**
 * Calculate workspace affinity score.
 * Returns 1.0 for exact match, 0.5 if no workspace specified (neutral).
 * Returns 0.0 AND eligible:false for mismatch (HARD REJECT).
 * 
 * SINGLE SOURCE OF TRUTH: task.to.workspaceId (repoId like "OpenSourceWTF/WAAAH")
 * Matches against agent's workspaceContext.repoId
 * 
 * NOTE: context.security.workspaceRoot was removed in Session 043 schema consolidation.
 * All workspace routing now flows through task.to.workspaceId only.
 */
function calculateWorkspaceScore(task: Task, agent: WaitingAgent): { score: number; eligible: boolean } {
  // Single source: task.to.workspaceId
  const taskWorkspaceId = task.to?.workspaceId;

  // Agent workspace
  const agentRepoId = agent.workspaceContext?.repoId;

  // If task has no workspace requirement, neutral
  if (!taskWorkspaceId) {
    return { score: 0.5, eligible: true };
  }

  // If agent has no workspace context, neutral (can work anywhere)
  if (!agentRepoId) {
    return { score: 0.5, eligible: true };
  }

  // Exact repoId match required
  if (taskWorkspaceId === agentRepoId) {
    return { score: 1.0, eligible: true };
  }

  // HARD REJECT: workspace specified but no match
  return { score: 0.0, eligible: false };
}

/**
 * Calculate capability match score.
 * Uses EXACT matching: all required capabilities must be present.
 * Returns 1.0 for exact match, 0.0 if any capability is missing.
 */
function calculateCapabilityScore(task: Task, agent: WaitingAgent): { score: number; eligible: boolean } {
  const required = task.to.requiredCapabilities || [];

  if (required.length === 0) {
    // No capabilities required - any agent can take it
    return { score: 1.0, eligible: true };
  }

  // Check exact match - agent must have ALL required capabilities
  const agentCaps = new Set(agent.capabilities);
  const hasAll = required.every(cap => agentCaps.has(cap));

  if (!hasAll) {
    return { score: 0.0, eligible: false }; // Hard reject
  }

  return { score: 1.0, eligible: true };
}

/**
 * Calculate agent hint score.
 * Returns 1.0 if task prefers this agent, 0.5 if no preference, 0.0 if hints another agent.
 */
function calculateHintScore(task: Task, agent: WaitingAgent): number {
  const preferredAgent = task.to.agentId;

  if (!preferredAgent) {
    return 0.5; // No preference - neutral
  }
  return preferredAgent === agent.agentId ? 1.0 : 0.3; // Slight penalty for non-preferred, but still eligible
}

/**
 * Score an agent against a task.
 */
export function scoreAgent(task: Task, agent: WaitingAgent): AgentScore {
  const { score: workspaceScore, eligible: workspaceEligible } = calculateWorkspaceScore(task, agent);
  const { score: capabilityScore, eligible: capabilityEligible } = calculateCapabilityScore(task, agent);
  const hintScore = calculateHintScore(task, agent);

  // BOTH workspace AND capabilities must be eligible
  const eligible = workspaceEligible && capabilityEligible;

  // Weighted combination
  const { weights } = SCHEDULER_CONFIG;
  const score = eligible
    ? (workspaceScore * weights.workspace) +
    (capabilityScore * weights.capabilities) +
    (hintScore * weights.agentHint)
    : 0;

  return {
    agentId: agent.agentId,
    score,
    eligible,
    workspaceScore,
    capabilityScore,
    hintScore,
    waitingSince: agent.waitingSince
  };
}

/**
 * Find the best agent for a task.
 * Returns the highest-scoring eligible agent, or null if none.
 * Uses waitingSince as tiebreaker (oldest first for fairness).
 */
export function findBestAgent(task: Task, waitingAgents: WaitingAgent[]): WaitingAgent | null {
  if (waitingAgents.length === 0) return null;

  // Score all agents
  const scores = waitingAgents.map(agent => scoreAgent(task, agent));

  // Filter to eligible only
  const eligible = scores.filter(s => s.eligible);
  if (eligible.length === 0) {
    console.log(`[Matcher] No eligible agents for task ${task.id} (required: ${task.to.requiredCapabilities?.join(', ') || 'none'})`);
    return null;
  }

  // Sort by score (descending), then by waitingSince (ascending for fairness)
  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.waitingSince - b.waitingSince;
  });

  const best = eligible[0];
  const agent = waitingAgents.find(a => a.agentId === best.agentId)!;

  console.log(`[Matcher] Best match for task ${task.id}: ${best.agentId} (score: ${best.score.toFixed(2)}, workspace: ${best.workspaceScore}, caps: ${best.capabilityScore}, hint: ${best.hintScore})`);
  return agent;
}

// ===== Legacy Compatibility =====

/**
 * Checks if a task matches an agent's capabilities.
 * @deprecated Use scoreAgent() for full scoring.
 */
export function isTaskForAgent(task: Task, agentId: string, capabilities: StandardCapability[]): boolean {
  const agent: WaitingAgent = {
    agentId,
    capabilities,
    waitingSince: Date.now()
  };
  const score = scoreAgent(task, agent);
  return score.eligible;
}

/**
 * Finds and reserves a matching waiting agent for a task.
 * Atomically removes agent from waiting list and transitions task to PENDING_ACK.
 */
export function findAndReserveAgent(queue: IMatcherQueue, task: Task): string | null {
  const waitingAgents = queue.getWaitingAgentsWithDetails();
  const bestAgent = findBestAgent(task, waitingAgents);

  if (!bestAgent) return null;

  // Atomic reservation:
  // 1. Transition task to PENDING_ACK and record in pendingAcks
  queue.updateStatus(task.id, 'PENDING_ACK');
  queue.pendingAcks.set(task.id, {
    taskId: task.id,
    agentId: bestAgent.agentId,
    sentAt: Date.now()
  });

  // 2. Emit notification to agent's listener
  console.log(`[Matcher] Reserved task ${task.id} for agent ${bestAgent.agentId}`);
  queue.emit('task', task, bestAgent.agentId);

  // 3. Remove agent from waiting list
  queue.removeWaitingAgent(bestAgent.agentId);

  return bestAgent.agentId;
}

/**
 * Finds a pending task suitable for an agent.
 * Skips tasks with unsatisfied dependencies.
 * Prioritizes tasks that were previously assigned to this agent (affinity on feedback).
 */
export function findPendingTaskForAgent(
  queue: IMatcherQueue,
  agentId: string,
  capabilities: StandardCapability[],
  workspaceContext?: WaitingAgent['workspaceContext'],
  getTask?: (taskId: string) => Task | undefined
): Task | undefined {
  const candidates = queue.getByStatuses(['QUEUED', 'APPROVED_QUEUED']);

  // Filter out tasks with unsatisfied dependencies
  const eligibleCandidates = candidates.filter(task => {
    if (!getTask) return true; // No getTask fn, can't check deps
    return areDependenciesMet(task, getTask);
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
    if (scoreA !== scoreB) return scoreB - scoreA; // Higher priority first
    return a.createdAt - b.createdAt; // Older first
  });

  const agent: WaitingAgent = {
    agentId,
    capabilities,
    workspaceContext,
    waitingSince: Date.now()
  };

  // Find first task this agent is eligible for
  for (const task of eligibleCandidates) {
    const score = scoreAgent(task, agent);
    if (score.eligible) {
      return task;
    }
  }

  return undefined;
}

/**
 * Long-polling implementation for agents to wait for tasks.
 * Uses capability-based matching.
 */
export async function waitForTask(
  queue: IMatcherQueue,
  agentId: string,
  capabilities: StandardCapability[],
  workspaceContext?: WaitingAgent['workspaceContext'],
  timeoutMs: number = 290000
): Promise<WaitForTaskResult> {
  // 0. Check for pending eviction FIRST
  const eviction = queue.popEviction(agentId);
  if (eviction) {
    return { controlSignal: 'EVICT', ...eviction };
  }

  // Track this agent as waiting with capabilities
  queue.addWaitingAgent(agentId, capabilities, workspaceContext);

  // 1. Check if there are pending tasks for this agent
  const getTaskFn = (taskId: string) => queue.getTask?.(taskId) || queue.getTaskFromDB?.(taskId);
  const pendingTask = findPendingTaskForAgent(queue, agentId, capabilities, workspaceContext, getTaskFn);
  if (pendingTask) {
    queue.removeWaitingAgent(agentId);
    queue.updateStatus(pendingTask.id, 'PENDING_ACK');
    queue.pendingAcks.set(pendingTask.id, {
      taskId: pendingTask.id,
      agentId,
      sentAt: Date.now()
    });
    return pendingTask;
  }

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutTimer: NodeJS.Timeout;

    const finish = (result: WaitForTaskResult) => {
      if (resolved) return;
      resolved = true;

      queue.off('task', onTask);
      queue.off('eviction', onEviction);
      if (timeoutTimer) clearTimeout(timeoutTimer);

      queue.removeWaitingAgent(agentId);
      resolve(result);
    };

    const onTask = (task: Task, intendedAgentId?: string) => {
      if (intendedAgentId === agentId) {
        finish(task);
      }
    };

    const onEviction = (targetId: string) => {
      if (targetId === agentId) {
        const ev = queue.popEviction(agentId);
        if (ev) finish({ controlSignal: 'EVICT', ...ev });
      }
    };

    queue.on('task', onTask);
    queue.on('eviction', onEviction);

    timeoutTimer = setTimeout(() => {
      finish(null);
    }, timeoutMs);
  });
}
