/**
 * UI-specific types for Kanban components
 * 
 * These types are intentionally separate from @opensourcewtf/waaah-types to:
 * 1. Include UI-specific extensions (e.g., images on TaskMessage)
 * 2. Use relaxed types (string instead of TaskStatus) for display flexibility
 * 3. Avoid bundler complexity of importing from monorepo packages
 * 
 * @see packages/types/src/index.ts for server-side canonical types
 */

/** Message in a task's conversation thread */
export interface TaskMessage {
  id?: string;
  timestamp: number;
  role: 'user' | 'agent' | 'system';
  content: string;
  isRead?: boolean;
  messageType?: 'comment' | 'progress' | 'review_feedback' | 'block_event';
  replyTo?: string;
  metadata?: Record<string, unknown>;
  /** UI-specific: images attached to messages (displayed in dashboard) */
  images?: Array<{ dataUrl: string; mimeType: string; name: string }>;
}

/** Task representation for UI display */
export interface Task {
  id: string;
  command: string;
  prompt: string;
  title?: string;
  status: string;
  toAgentId?: string;
  toAgentRole?: string;
  assignedTo?: string;
  context?: Record<string, unknown>;
  dependencies?: string[];
  response?: Record<string, unknown>;
  messages?: TaskMessage[];
  history?: { timestamp: number; status: string; agentId?: string; message?: string }[];
  createdAt?: number;
  completedAt?: number;
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
}

export const COLUMNS = [
  { id: 'TODO', label: 'TODO', statuses: ['QUEUED', 'PENDING_ACK'] },
  { id: 'IN_PROGRESS', label: 'IN PROGRESS', statuses: ['ASSIGNED', 'IN_PROGRESS', 'PROCESSING', 'APPROVED_QUEUED', 'APPROVED_PENDING_ACK'] },
  { id: 'REVIEW', label: 'IN REVIEW', statuses: ['BLOCKED', 'PENDING_RES', 'REVIEW', 'IN_REVIEW', 'PENDING'] },
  { id: 'DONE', label: 'DONE', statuses: ['COMPLETED'] },
  { id: 'CANCELLED', label: 'CANCELLED', statuses: ['CANCELLED', 'FAILED', 'REJECTED'] }
];
