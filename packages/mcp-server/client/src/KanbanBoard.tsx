import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";

// Import from modular components
import type { Task } from './components/kanban';
import { COLUMNS, getStatusBadgeClass, getTaskDuration, formatTaskTitle, formatDate } from './components/kanban';
import { ExpandedCardView } from './components/kanban/ExpandedCardView';

interface KanbanBoardProps {
  tasks: Task[];
  completedTasks: Task[];
  cancelledTasks: Task[];
  onCancelTask: (e: React.MouseEvent, id: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onApproveTask: (e: React.MouseEvent, id: string) => void;
  onRejectTask: (id: string, feedback: string) => void;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: { id: string; dataUrl: string; mimeType: string; name: string }[]) => void;
  onAddReviewComment: (taskId: string, filePath: string, lineNumber: number | null, content: string) => void;
  onViewHistory: () => void;
  onTaskClick?: (task: Task) => void;
}

// Helper to create a fingerprint of tasks for comparison
function tasksFingerprint(tasks: Task[]): string {
  return tasks.map(t => `${t.id}:${t.status}`).join('|');
}

// Custom comparison: prevent re-render if task IDs/statuses haven't changed
function arePropsEqual(prev: KanbanBoardProps, next: KanbanBoardProps): boolean {
  return (
    tasksFingerprint(prev.tasks) === tasksFingerprint(next.tasks) &&
    tasksFingerprint(prev.completedTasks) === tasksFingerprint(next.completedTasks) &&
    tasksFingerprint(prev.cancelledTasks) === tasksFingerprint(next.cancelledTasks)
  );
}

export const KanbanBoard = React.memo(function KanbanBoard({
  tasks,
  completedTasks,
  cancelledTasks,
  onCancelTask,
  onRetryTask,
  onApproveTask,
  onRejectTask,
  onSendComment,
  onAddReviewComment
}: KanbanBoardProps) {
  // Expanded card state
  const [expandedTask, setExpandedTask] = useState<Task | null>(null);

  // Rejection modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);

  // Keep expanded task data fresh during polling
  useEffect(() => {
    if (expandedTask) {
      const allTasks = [...tasks, ...completedTasks, ...cancelledTasks];
      const freshTask = allTasks.find(t => t.id === expandedTask.id);
      if (freshTask && JSON.stringify(freshTask) !== JSON.stringify(expandedTask)) {
        setExpandedTask(freshTask);
      }
    }
  }, [tasks, completedTasks, cancelledTasks, expandedTask]);

  // Group tasks by column
  const columns = useMemo(() => {
    const cols: Record<string, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      APPROVED: [],
      DONE: [...completedTasks],
      CANCELLED: [...cancelledTasks]
    };

    tasks.forEach(task => {
      if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(task.status)) {
        const col = COLUMNS.find(c => c.statuses.includes(task.status));
        if (col) {
          cols[col.id].push(task);
        }
      }
    });

    tasks.forEach(task => {
      if (['CANCELLED', 'FAILED'].includes(task.status)) {
        cols['CANCELLED'].push(task);
      }
    });

    return cols;
  }, [tasks, completedTasks, cancelledTasks]);

  // Handlers
  const handleCardClick = useCallback((task: Task) => {
    setExpandedTask(task);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpandedTask(null);
  }, []);



  const handleCloseRejectModal = useCallback(() => {
    setShowRejectModal(false);
    setRejectFeedback('');
    setRejectingTaskId(null);
  }, []);

  const handleConfirmReject = useCallback(() => {
    if (rejectingTaskId && rejectFeedback.trim()) {
      onRejectTask(rejectingTaskId, rejectFeedback.trim());
      handleCloseRejectModal();
      handleCloseExpanded();
    }
  }, [rejectingTaskId, rejectFeedback, onRejectTask, handleCloseRejectModal, handleCloseExpanded]);

  return (
    <div className="relative flex h-full gap-4 overflow-x-auto pb-4">
      {/* Backdrop when expanded */}
      {expandedTask && (
        <div
          key="backdrop"
          className="absolute inset-0 z-10 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 fill-mode-forwards"
          onClick={handleCloseExpanded}
        />
      )}

      {/* Expanded Card View */}
      {expandedTask && (
        <ExpandedCardView
          task={expandedTask}
          onClose={handleCloseExpanded}
          onSendComment={onSendComment}
          onApproveTask={onApproveTask}
          onRejectTask={onRejectTask}
          onRetryTask={onRetryTask}
          onCancelTask={onCancelTask}
          onAddReviewComment={onAddReviewComment}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border-2 border-primary p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-bold text-primary mb-4">Reject Task</h3>
            <p className="text-sm text-primary/70 mb-4">Please provide feedback for why this task is being rejected:</p>
            <textarea
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              placeholder="Enter rejection feedback..."
              className="w-full h-24 p-3 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-primary resize-none"
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button onClick={handleCloseRejectModal} className="px-4 py-2 text-sm border border-primary/30 text-primary/70 hover:bg-primary/10">Cancel</button>
              <button onClick={handleConfirmReject} disabled={!rejectFeedback.trim()} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban Columns */}
      {COLUMNS.map(col => (
        <div key={col.id} className="flex-shrink-0 w-72 min-w-[280px] flex flex-col border-2 border-primary/30">
          {/* Column Header - lighter */}
          <div className="flex items-center justify-between p-3 pb-2 border-b-2 border-primary/30 bg-card/80">
            <h3 className="font-bold text-sm text-primary">{col.label}</h3>
            <Badge variant="outline" className="text-xs border-primary/50">{columns[col.id].length}</Badge>
          </div>
          {/* Column Body - darker */}
          <div className="flex-1 space-y-2 overflow-y-auto p-2 bg-black/30">
            {columns[col.id].map(task => {
              const unreadCount = task.messages?.filter(m => m.role === 'user' && m.isRead === false).length ?? 0;
              const progressUpdates = task.messages?.filter(m => m.role === 'agent' && m.metadata && (m.metadata as Record<string, unknown>).percentage !== undefined) ?? [];
              const latestProgress = progressUpdates.length > 0 ? progressUpdates[progressUpdates.length - 1] : null;
              const percentage = latestProgress ? ((latestProgress.metadata as Record<string, unknown>)?.percentage as number) || 0 : 0;
              const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status);

              return (
                <Card
                  key={task.id}
                  className="cursor-pointer hover:border-primary/50 transition-all duration-200 bg-card/80 hover:bg-card border-2 border-primary/20 hover:shadow-lg hover:shadow-primary/10 rounded-none"
                  onClick={() => handleCardClick(task)}
                >
                  <CardHeader className="p-3 pb-2 space-y-1">
                    {/* Row 1: Status + NEW badge */}
                    <div className="flex items-center justify-between">
                      <Badge className={getStatusBadgeClass(task.status)}>{task.status}</Badge>
                      {unreadCount > 0 && (
                        <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5">{unreadCount} PENDING</Badge>
                      )}
                    </div>
                    {/* Row 2: Agent (if assigned) */}
                    {task.assignedTo && (
                      <div className="text-[10px] text-primary/60 flex items-center gap-1">
                        <User className="h-2.5 w-2.5" />
                        {task.assignedTo}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-3 pt-0 space-y-2">
                    <p className="text-sm font-medium line-clamp-2 leading-tight">{formatTaskTitle(task)}</p>

                    {/* Progress Bar */}
                    {(latestProgress || isTerminal) && (
                      <div className="space-y-1">
                        <div className="h-1.5 bg-primary/20 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${task.status === 'COMPLETED' ? 'bg-green-500' :
                              ['FAILED', 'CANCELLED'].includes(task.status) ? 'bg-red-500' : 'bg-primary'
                              }`}
                            style={{ width: `${isTerminal ? 100 : percentage}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Task ID - full row */}
                    <div className="font-mono text-[10px] text-primary/50 truncate">
                      {task.id}
                    </div>
                    {/* Created at + Duration on same line */}
                    {task.createdAt && (
                      <div className="flex items-center justify-between text-[10px] mt-1">
                        <span className="text-primary/40">
                          {formatDate(task.createdAt)}
                        </span>
                        <span className="flex items-center gap-1 text-primary/60">
                          <Clock className="h-2.5 w-2.5" />
                          {getTaskDuration(task)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {columns[col.id].length === 0 && (
              <div className="text-center text-primary/30 text-xs py-8 italic">No tasks</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}, arePropsEqual);
