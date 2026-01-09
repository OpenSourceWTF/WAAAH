/**
 * Agent Status Utilities
 * 
 * Shared helpers for determining agent connection status.
 * Extracted to eliminate code duplication across server.ts and tools.ts.
 */
import type { Task, AgentConnectionStatus } from '@opensourcewtf/waaah-types';

/**
 * Determines the connection status of an agent based on their activity.
 * 
 * @param assignedTasks - Tasks currently assigned to the agent
 * @param isWaiting - Whether the agent is actively waiting for tasks
 * @param isRecent - Whether the agent was recently seen (within offline threshold)
 * @returns The agent's connection status: 'PROCESSING', 'WAITING', or 'OFFLINE'
 */
export function determineAgentStatus(
  assignedTasks: Task[],
  isWaiting: boolean,
  isRecent: boolean
): AgentConnectionStatus {
  if (assignedTasks.length > 0) return 'PROCESSING';
  if (isWaiting || isRecent) return 'WAITING';
  return 'OFFLINE';
}
