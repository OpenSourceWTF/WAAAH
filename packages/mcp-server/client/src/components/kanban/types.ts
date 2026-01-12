/**
 * UI-specific types for Kanban components
 * 
 * These types extend the canonical types from @opensourcewtf/waaah-types
 * with UI-specific additions (e.g., images on messages).
 */
import type {
  TaskStatus,
  WorkspaceContext,
  AgentSource
} from '@opensourcewtf/waaah-types';

// Re-export base types for convenience
export type { TaskStatus, WorkspaceContext, AgentSource };

/** 
 * Task message with UI-specific extensions 
 * Redefined to allow optional id for UI creation
 */
export interface TaskMessage {
  id?: string;
  taskId?: string;
  timestamp: number;
  role: 'user' | 'agent' | 'system';
  content: string;
  isRead?: boolean;
  messageType?: 'comment' | 'progress' | 'review_feedback' | 'block_event';
  replyTo?: string;
  metadata?: Record<string, unknown>;
  /** UI-specific: images attached to messages */
  images?: Array<{ dataUrl: string; mimeType: string; name: string }>;
}

/** 
 * Task representation for UI display
 * Uses string status for display flexibility (API returns strings)
 */
export interface Task {
  id: string;
  command?: string;
  prompt: string;
  title?: string;
  status: string; // String for display flexibility
  assignedTo?: string;
  context?: Record<string, unknown>;
  dependencies?: string[];
  response?: Record<string, unknown>;
  messages?: TaskMessage[];
  history?: { timestamp: number; status: string; agentId?: string; message?: string }[];
  createdAt?: number;
  completedAt?: number;
  /** Routing information from canonical Task.to */
  to?: {
    workspaceId?: string;
    requiredCapabilities?: string[];
    agentId?: string;
    agentRole?: string;
  };
  /** Source of task creation */
  source?: 'UI' | 'CLI' | 'Agent';
  /** Explicit workspace context for list display */
  workspaceContext?: WorkspaceContext;
}

/**
 * Agent for UI display
 * Matches AgentIdentity from canonical types with UI-specific status
 */
export interface Agent {
  id: string;
  displayName: string;
  role?: string;
  status: 'OFFLINE' | 'WAITING' | 'PROCESSING';
  lastSeen?: number;
  currentTasks?: string[];
  capabilities?: string[];
  createdAt?: number;
  source?: AgentSource;
  color?: string;
  workspaceContext?: WorkspaceContext;
}

export interface KanbanBoardProps {
  tasks: Task[];
  completedTasks: Task[];
  cancelledTasks: Task[];
  onCancelTask: (e: React.MouseEvent, id: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onApproveTask: (id: string) => void;
  onRejectTask: (id: string, feedback: string) => void;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: Array<{ id: string; dataUrl: string; mimeType: string; name: string }>) => void;
  onAddReviewComment: (taskId: string, filePath: string, lineNumber: number | null, content: string) => void;
  onViewHistory?: () => void;
  onTaskClick?: (task: Task) => void;
  onUnblockTask?: (taskId: string, reason: string) => void;
  onLoadMoreCompleted?: () => void;
  onLoadMoreCancelled?: () => void;
  hasMoreCompleted?: boolean;
  hasMoreCancelled?: boolean;
  loadingMore?: 'completed' | 'cancelled' | null;
}

export const COLUMNS = [
  { id: 'TODO', label: 'TODO', statuses: ['QUEUED', 'PENDING_ACK'] },
  { id: 'IN_PROGRESS', label: 'IN PROGRESS', statuses: ['ASSIGNED', 'IN_PROGRESS', 'PROCESSING', 'APPROVED_QUEUED', 'APPROVED_PENDING_ACK'] },
  { id: 'REVIEW', label: 'IN REVIEW', statuses: ['BLOCKED', 'PENDING_RES', 'REVIEW', 'IN_REVIEW', 'PENDING'] },
  { id: 'DONE', label: 'DONE', statuses: ['COMPLETED'] },
  { id: 'CANCELLED', label: 'CANCELLED', statuses: ['CANCELLED', 'FAILED', 'REJECTED'] }
];
