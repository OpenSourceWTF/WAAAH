import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Loader2 } from "lucide-react";

// Import from modular components
import type { Task } from './components/kanban';
import { COLUMNS, getStatusBadgeClass, getTaskDuration, formatTaskTitle, formatDate, formatStatusLabel } from './components/kanban';
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
  onUnblockTask?: (taskId: string, reason: string) => void;
  onViewHistory?: () => void;
  onTaskClick?: (task: Task) => void;
  onUpdateTask?: (taskId: string, updates: Record<string, any>) => Promise<void>;
  onExpandChange?: (isExpanded: boolean) => void;
  onLoadMoreCompleted?: () => void;
  onLoadMoreCancelled?: () => void;
  hasMoreCompleted?: boolean;
  hasMoreCancelled?: boolean;
  loadingMore?: 'completed' | 'cancelled' | null;
  // Search query for filtering
  searchQuery?: string;
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
    tasksFingerprint(prev.cancelledTasks) === tasksFingerprint(next.cancelledTasks) &&
    prev.hasMoreCompleted === next.hasMoreCompleted &&
    prev.hasMoreCancelled === next.hasMoreCancelled &&
    prev.loadingMore === next.loadingMore &&
    prev.searchQuery === next.searchQuery
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
  onAddReviewComment,
  onUnblockTask,
  onLoadMoreCompleted,
  onLoadMoreCancelled,
  hasMoreCompleted,
  hasMoreCancelled,
  loadingMore,
  onUpdateTask,
  searchQuery = '',
  onExpandChange
}: KanbanBoardProps) {
  // Expanded card state
  const [expandedTask, setExpandedTask] = useState<Task | null>(null);

  // Refs for infinite scroll observers
  const completedSentinelRef = useRef<HTMLDivElement>(null);
  const cancelledSentinelRef = useRef<HTMLDivElement>(null);

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

  // Group tasks by column with search filtering
  const columns = useMemo(() => {
    // Helper function to filter by search
    const matchesSearch = (task: Task): boolean => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        task.id.toLowerCase().includes(query) ||
        (task.title?.toLowerCase().includes(query) ?? false) ||
        task.prompt.toLowerCase().includes(query) ||
        task.status.toLowerCase().includes(query) ||
        (task.assignedTo?.toLowerCase().includes(query) ?? false)
      );
    };

    const cols: Record<string, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      APPROVED: [],
      DONE: completedTasks.filter(matchesSearch),
      CANCELLED: cancelledTasks.filter(matchesSearch)
    };

    tasks.filter(matchesSearch).forEach(task => {
      if (!['COMPLETED', 'CANCELLED', 'FAILED'].includes(task.status)) {
        const col = COLUMNS.find(c => c.statuses.includes(task.status));
        if (col) {
          cols[col.id].push(task);
        }
      }
    });

    tasks.filter(matchesSearch).forEach(task => {
      if (['CANCELLED', 'FAILED'].includes(task.status)) {
        cols['CANCELLED'].push(task);
      }
    });

    return cols;
  }, [tasks, completedTasks, cancelledTasks, searchQuery]);

  // Handlers
  const handleCardClick = useCallback((task: Task) => {
    setExpandedTask(task);
    onExpandChange?.(true);
  }, [onExpandChange]);

  const handleCloseExpanded = useCallback(() => {
    setExpandedTask(null);
    onExpandChange?.(false);
  }, [onExpandChange]);



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

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const completedSentinel = completedSentinelRef.current;
    const cancelledSentinel = cancelledSentinelRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            if (entry.target === completedSentinel && hasMoreCompleted && !loadingMore && onLoadMoreCompleted) {
              onLoadMoreCompleted();
            }
            if (entry.target === cancelledSentinel && hasMoreCancelled && !loadingMore && onLoadMoreCancelled) {
              onLoadMoreCancelled();
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (completedSentinel) observer.observe(completedSentinel);
    if (cancelledSentinel) observer.observe(cancelledSentinel);

    return () => {
      if (completedSentinel) observer.unobserve(completedSentinel);
      if (cancelledSentinel) observer.unobserve(cancelledSentinel);
    };
  }, [hasMoreCompleted, hasMoreCancelled, loadingMore, onLoadMoreCompleted, onLoadMoreCancelled]);

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
          onUnblockTask={onUnblockTask}
          onUpdateTask={onUpdateTask}
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
        <div key={col.id} className="flex-1 min-w-[180px] flex flex-col border-2 border-primary/30">
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
                    {/* Row 1: Status + BLOCKED/NEW badge + Source badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Badge className={getStatusBadgeClass(task.status)}>{formatStatusLabel(task.status)}</Badge>
                        {task.status === 'BLOCKED' && (
                          <Badge className="bg-orange-500 text-white text-compact px-1.5 py-0.5 border border-orange-700">⛔ BLOCKED</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                          <Badge className="bg-amber-500 text-white text-compact px-1.5 py-0.5">{unreadCount} PENDING</Badge>
                        )}
                        {/* Source badge */}
                        {task.source && (
                          <Badge className={`text-compact px-1.5 py-0.5 ${task.source === 'UI' ? 'bg-blue-500 text-white border border-blue-700' :
                            task.source === 'CLI' ? 'bg-green-500 text-white border border-green-700' :
                              'bg-purple-500 text-white border border-purple-700'
                            }`}>{task.source}</Badge>
                        )}
                      </div>
                    </div>
                    {/* Row 2: Agent (if assigned) */}
                    {task.assignedTo && (
                      <div className="text-compact text-primary/60 flex items-center gap-1">
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
                    <div className="font-mono text-compact text-primary/50 truncate">
                      {task.id}
                    </div>

                    {/* Capabilities - same style as AgentCard */}
                    {task.to?.requiredCapabilities && task.to.requiredCapabilities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {task.to.requiredCapabilities.slice(0, 3).map(cap => (
                          <span key={cap} className="text-compact bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/20">{cap}</span>
                        ))}
                        {task.to.requiredCapabilities.length > 3 && (
                          <span className="text-compact text-primary/50">+{task.to.requiredCapabilities.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Workspace - same style as AgentCard */}
                    {(task.workspaceContext?.repoId || task.to?.workspaceId) && (
                      <div className="text-compact font-mono text-primary/70 bg-black/20 px-1.5 py-0.5 border border-primary/20 truncate mt-1">
                        {task.workspaceContext?.repoId || task.to?.workspaceId}
                      </div>
                    )}

                    {/* Created at + Duration on same line */}
                    {task.createdAt && (
                      <div className="flex items-center justify-between text-compact mt-1">
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
            {/* Infinite scroll sentinel for DONE column */}
            {col.id === 'DONE' && hasMoreCompleted && (
              <div ref={completedSentinelRef} className="w-full py-2 text-center text-xs text-primary/40">
                {loadingMore === 'completed' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <span className="opacity-50">Scroll for more</span>
                )}
              </div>
            )}
            {/* Infinite scroll sentinel for CANCELLED column */}
            {col.id === 'CANCELLED' && hasMoreCancelled && (
              <div ref={cancelledSentinelRef} className="w-full py-2 text-center text-xs text-primary/40">
                {loadingMore === 'cancelled' ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  <span className="opacity-50">Scroll for more</span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}, arePropsEqual);
