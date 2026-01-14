import React from 'react';

// Import from modular components
import type { Task } from './components/kanban';
import { COLUMNS, ExpandedCardView, KanbanColumn, RejectModal } from './components/kanban';
import { useInfiniteScroll, useFilteredTasks, useExpandedTask, useRejectModal, getColumnScrollProps } from './hooks';

interface KanbanBoardProps {
  tasks: Task[];
  completedTasks: Task[];
  onDeleteTask: (id: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onApproveTask: (e: React.MouseEvent, id: string) => void;
  onRejectTask: (id: string, feedback: string) => void;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: { id: string; dataUrl: string; mimeType: string; name: string }[]) => void;
  onAddReviewComment: (taskId: string, filePath: string, lineNumber: number | null, content: string) => void;
  onUnblockTask?: (taskId: string, reason: string) => void;
  onViewHistory?: () => void;
  onTaskClick?: (task: Task) => void;
  onUpdateTask?: (taskId: string, updates: Record<string, unknown>) => Promise<void>;
  onExpandChange?: (isExpanded: boolean) => void;
  onLoadMoreCompleted?: () => void;
  hasMoreCompleted?: boolean;
  loadingMore?: 'completed' | null;
  searchQuery?: string;
}

// Helper to create a fingerprint of tasks for comparison
function tasksFingerprint(tasks: Task[]): string {
  return tasks.map(t => `${t.id}:${t.status}`).join('|');
}

// Custom comparison: prevent re-render if task IDs/statuses haven't changed
function arePropsEqual(prev: KanbanBoardProps, next: KanbanBoardProps): boolean {
  const tasksMatch = tasksFingerprint(prev.tasks) === tasksFingerprint(next.tasks);
  const completedMatch = tasksFingerprint(prev.completedTasks) === tasksFingerprint(next.completedTasks);
  const scrollMatch = prev.hasMoreCompleted === next.hasMoreCompleted;
  const loadingMatch = prev.loadingMore === next.loadingMore;
  const searchMatch = prev.searchQuery === next.searchQuery;

  return tasksMatch && completedMatch && scrollMatch && loadingMatch && searchMatch;
}

export const KanbanBoard = React.memo(function KanbanBoard({
  tasks,
  completedTasks,
  onDeleteTask,
  onRetryTask,
  onApproveTask,
  onRejectTask,
  onSendComment,
  onAddReviewComment,
  onUnblockTask,
  onLoadMoreCompleted,
  hasMoreCompleted,
  loadingMore,
  onUpdateTask,
  searchQuery = '',
  onExpandChange
}: KanbanBoardProps) {
  // Use custom hooks for state management
  const { expandedTask, handleCardClick, handleCloseExpanded } = useExpandedTask({
    tasks,
    completedTasks,
    onExpandChange
  });

  const columns = useFilteredTasks({
    tasks,
    completedTasks,
    searchQuery
  });

  const { completedSentinelRef } = useInfiniteScroll({
    hasMoreCompleted,
    loadingMore,
    onLoadMoreCompleted
  });

  const rejectModal = useRejectModal({
    onRejectTask,
    onCloseExpanded: handleCloseExpanded
  });

  const scrollOptions = { hasMoreCompleted, loadingMore, completedSentinelRef };

  return (
    <div className="relative flex h-full gap-4 overflow-x-auto pb-4">
      {/* Backdrop when expanded */}
      {expandedTask ? (
        <div
          key="backdrop"
          className="absolute inset-0 z-10 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 fill-mode-forwards"
          onClick={handleCloseExpanded}
        />
      ) : null}

      {/* Expanded Card View */}
      {expandedTask ? (
        <ExpandedCardView
          task={expandedTask}
          onClose={handleCloseExpanded}
          onSendComment={onSendComment}
          onApproveTask={onApproveTask}
          onRejectTask={onRejectTask}
          onRetryTask={onRetryTask}
          onDeleteTask={onDeleteTask}
          onAddReviewComment={onAddReviewComment}
          onUnblockTask={onUnblockTask}
          onUpdateTask={onUpdateTask}
        />
      ) : null}

      {/* Reject Modal */}
      <RejectModal
        show={rejectModal.showRejectModal}
        feedback={rejectModal.rejectFeedback}
        onFeedbackChange={rejectModal.setRejectFeedback}
        onConfirm={rejectModal.handleConfirmReject}
        onCancel={rejectModal.handleCloseRejectModal}
      />

      {/* Kanban Columns */}
      {COLUMNS.map(col => (
        <KanbanColumn
          key={col.id}
          id={col.id}
          label={col.label}
          tasks={columns[col.id]}
          onCardClick={handleCardClick}
          {...getColumnScrollProps(col.id, scrollOptions)}
        />
      ))}
    </div>
  );
}, arePropsEqual);
