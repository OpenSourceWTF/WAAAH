/**
 * Agent Status Utilities
 * 
 * Shared helpers for determining agent connection status.
 * Simplified to use only task assignment and waiting state.
 * Staleness is handled at the TASK level (lastProgressAt), not agent level.
 */
import type { Task, AgentConnectionStatus } from '@opensourcewtf/waaah-types';

/**
 * Determines the connection status of an agent based on their activity.
 * 
 * @param assignedTasks - Tasks currently assigned to the agent
 * @param isWaiting - Whether the agent is actively waiting for tasks
 * @returns The agent's connection status: 'PROCESSING', 'WAITING', or 'OFFLINE'
 */
export function determineAgentStatus(
  assignedTasks: Task[],
  isWaiting: boolean
): AgentConnectionStatus {
  if (assignedTasks.length > 0) return 'PROCESSING';
  if (isWaiting) return 'WAITING';
  return 'OFFLINE';
}

