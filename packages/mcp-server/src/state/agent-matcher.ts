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
import { createPollingPromise } from './services/polling-utils.js';
import * as fs from 'fs';

const DEBUG_LOG_PATH = '/home/dtai/.gemini/antigravity/brain/aa449a4d-0305-4535-b102-cf765aa4cee1/debug_scheduler.log';

function logDebug(message: string) {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
  } catch (e) { /* ignore */ }
}

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
    logDebug(`NEUTRAL: Task ${task.id} (No WS requirement) vs Agent ${agent.agentId}`);
    return { score: 0.5, eligible: true };
  }

  // If agent has no workspace context, they CANNOT work on workspace-specific tasks.
  // This enforces strict affinity: Bound tasks require bound agents.
  if (!agentRepoId) {
    logDebug(`HARD REJECT: Task ${task.id} (WS=${taskWorkspaceId}) vs Agent ${agent.agentId} (No Context)`);
    return { score: 0.0, eligible: false }; // HARD REJECT
  }

  // Exact repoId match required
  if (taskWorkspaceId === agentRepoId) {
    logDebug(`MATCH: Task ${task.id} (WS=${taskWorkspaceId}) vs Agent ${agent.agentId} (WS=${agentRepoId})`);
    return { score: 1.0, eligible: true };
  }

  // Debug log for production diagnostics of affinity mismatches
  logDebug(`HARD REJECT: Task ${task.id} (WS=${taskWorkspaceId}) vs Agent ${agent.agentId} (WS=${agentRepoId})`);

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

// ===== Shared Utilities =====

/**
 * Priority scores for task sorting.
 */
const PRIORITY_SCORES: Record<string, number> = { critical: 3, high: 2, normal: 1 };

/**
 * Sorts tasks by: 1) Agent affinity, 2) Priority, 3) Age (oldest first).
 * Shared utility used by both agent-matcher and AgentMatchingService.
 */
export function sortTasksByPriority(tasks: Task[], agentId?: string): Task[] {
  return [...tasks].sort((a: Task, b: Task) => {
    // Agent affinity first - tasks previously assigned to this agent get priority
    if (agentId) {
      const aAffinity = a.assignedTo === agentId ? 1 : 0;
      const bAffinity = b.assignedTo === agentId ? 1 : 0;
      if (aAffinity !== bAffinity) return bAffinity - aAffinity;
    }

    const scoreA = PRIORITY_SCORES[a.priority] || 1;
    const scoreB = PRIORITY_SCORES[b.priority] || 1;
    if (scoreA !== scoreB) return scoreB - scoreA; // Higher priority first
    return a.createdAt - b.createdAt; // Older first
  });
}

/**
 * Finds a pending task suitable for an agent.
 * Skips tasks with unsatisfied dependencies.
 * Prioritizes tasks that were previously assigned to this agent (affinity on feedback).
 *
 * @deprecated Use AgentMatchingService.findPendingTaskForAgent() instead.
 * This function is maintained for legacy compatibility with IMatcherQueue.
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

  // Use shared sorting utility
  const sortedCandidates = sortTasksByPriority(eligibleCandidates, agentId);

  const agent: WaitingAgent = {
    agentId,
    capabilities,
    workspaceContext,
    waitingSince: Date.now()
  };

  // Find first task this agent is eligible for
  for (const task of sortedCandidates) {
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
 *
 * @deprecated Use PollingService.waitForTask() instead.
 * This function is maintained for legacy compatibility with IMatcherQueue.
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

  // Use shared polling utility
  return createPollingPromise({
    agentId,
    emitter: queue,
    timeoutMs,
    popEviction: (id) => queue.popEviction(id),
    onCleanup: () => queue.removeWaitingAgent(agentId)
  });
}
