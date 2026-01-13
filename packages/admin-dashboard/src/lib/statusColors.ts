// Centralized status color definitions for consistent styling across all components
// This is the single source of truth for status badge styling

export type TaskStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PROCESSING'
  | 'QUEUED'
  | 'PENDING'
  | 'PENDING_ACK'
  | 'PENDING_RES'
  | 'WAITING'
  | 'BLOCKED'
  | 'IN_REVIEW'
  | 'REVIEW'
  | 'APPROVED_QUEUED'
  | 'APPROVED_PENDING_ACK'
  | 'REJECTED';

export type AgentStatus = 'PROCESSING' | 'WAITING' | 'OFFLINE' | 'IDLE';

// Badge classes for task statuses
const STATUS_BADGE_MAP: Record<string, string> = {
  // Success
  COMPLETED: 'bg-green-600 text-white border-green-800',
  // Failure
  FAILED: 'bg-red-600 text-white border-red-800',
  CANCELLED: 'bg-red-600 text-white border-red-800',
  // Active/Processing
  ASSIGNED: 'bg-blue-600 text-white border-blue-800',
  IN_PROGRESS: 'bg-blue-600 text-white border-blue-800',
  PROCESSING: 'bg-blue-600 text-white border-blue-800',
  // Queued/Waiting
  QUEUED: 'bg-amber-500 text-black border-amber-700',
  PENDING: 'bg-amber-500 text-black border-amber-700',
  PENDING_ACK: 'bg-amber-500 text-black border-amber-700',
  WAITING: 'bg-amber-500 text-black border-amber-700',
  // Attention Required (needs human action)
  BLOCKED: 'bg-orange-500 text-white border-orange-700',
  PENDING_RES: 'bg-orange-500 text-white border-orange-700',
  IN_REVIEW: 'bg-purple-500 text-white border-purple-700',
  REVIEW: 'bg-purple-500 text-white border-purple-700',
  // Merging
  APPROVED_QUEUED: 'bg-purple-600 text-white border-purple-800',
  APPROVED_PENDING_ACK: 'bg-purple-600 text-white border-purple-800',
  // Rejected
  REJECTED: 'bg-red-500 text-white border-red-700',
};

const STATUS_BADGE_BASE = 'text-xs font-bold px-1.5 py-0.5 border animate-status-badge';

/**
 * Get the badge class for a task status
 */
export function getStatusBadgeClass(status: string): string {
  return `${STATUS_BADGE_BASE} ${STATUS_BADGE_MAP[status] || 'bg-gray-600 text-white border-gray-700'}`;
}

/**
 * Format status for display - shows user-friendly labels
 */
export function formatStatusLabel(status: string): string {
  switch (status) {
    case 'APPROVED_QUEUED':
    case 'APPROVED_PENDING_ACK':
      return 'MERGING';
    case 'PENDING_ACK':
      return 'PENDING';
    case 'PENDING_RES':
      return 'WAITING';
    case 'IN_REVIEW':
      return 'REVIEW';
    default:
      return status;
  }
}

// Agent status colors (for sidebar indicators and stripes)
export const AGENT_STATUS_COLORS = {
  PROCESSING: {
    text: 'text-cyan-400',
    bg: 'bg-cyan-400',
    stripe: 'bg-cyan-400 animate-pulse',
  },
  WAITING: {
    text: 'text-green-500',
    bg: 'bg-green-500',
    stripe: 'bg-green-500',
  },
  OFFLINE: {
    text: 'text-gray-500',
    bg: 'bg-gray-600',
    stripe: 'bg-gray-600',
  },
  IDLE: {
    text: 'text-yellow-500',
    bg: 'bg-yellow-500',
    stripe: 'bg-yellow-500',
  },
} as const;

export function getAgentStatusColors(status: string) {
  return AGENT_STATUS_COLORS[status as AgentStatus] || AGENT_STATUS_COLORS.IDLE;
}
