/**
 * Agent Status Utilities
 * 
 * Shared helpers for determining agent connection status.
 * Uses task assignment, waiting state, and lastSeen for accurate status.
 */
import type { Task, AgentConnectionStatus } from '@opensourcewtf/waaah-types';

/** Consider agents seen within this window as still connected */
const RECENTLY_SEEN_THRESHOLD_MS = 60_000; // 60 seconds

/**
 * Determines the connection status of an agent based on their activity.
 * 
 * @param assignedTasks - Tasks currently assigned to the agent
 * @param isWaiting - Whether the agent is actively waiting for tasks
 * @param lastSeen - Timestamp of last agent activity (optional)
 * @returns The agent's connection status: 'PROCESSING', 'WAITING', or 'OFFLINE'
 */
export function determineAgentStatus(
  assignedTasks: Task[],
  isWaiting: boolean,
  lastSeen?: number
): AgentConnectionStatus {
  if (assignedTasks.length > 0) return 'PROCESSING';
  if (isWaiting) return 'WAITING';

  // If agent was seen recently (within threshold), show as WAITING not OFFLINE
  // This prevents showing OFFLINE during brief gaps between poll cycles
  if (lastSeen && Date.now() - lastSeen < RECENTLY_SEEN_THRESHOLD_MS) {
    return 'WAITING';
  }

  return 'OFFLINE';
}
