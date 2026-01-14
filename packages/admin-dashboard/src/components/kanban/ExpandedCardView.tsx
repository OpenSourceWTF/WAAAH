import React, { useState, useCallback } from 'react';
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, FileText, Settings, CheckCircle } from "lucide-react";
import { DiffViewer } from "@/components/DiffViewer";
import type { Task } from './types';
import { getStatusBadgeClass, formatTaskTitle, getProgressUpdates } from './utils';
import { ImagePreviewModal } from './ImagePreviewModal';
import { MessageThread } from './MessageThread';
import { ContextTab } from './ContextTab';
import { TimelineTab } from './TimelineTab';
import {
  TaskActionButtons,
  ExpandedCardHeader,
  TaskProgressBar,
  FileNavigator,
  UnblockModal,
  RejectModal,
  DeleteConfirmModal,
} from './ExpandedCardComponents';
import { useResizableWidth, useDropdownState, useModalWithField } from './hooks';
import type { FileStats } from '@/utils/diffParser';

interface ExpandedCardViewProps {
  task: Task;
  onClose: () => void;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: Array<{ id: string; dataUrl: string; mimeType: string; name: string }>) => void;
  onApproveTask: (e: React.MouseEvent, id: string) => void;
  onRejectTask: (id: string, feedback: string) => void;
  onUnblockTask?: (taskId: string, reason: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddReviewComment: (taskId: string, filePath: string, lineNumber: number | null, content: string) => void;
  onUpdateTask?: (taskId: string, updates: Record<string, any>) => Promise<void>;
}

// Status check arrays
const canDeleteStatuses = ['QUEUED', 'ASSIGNED', 'PENDING_ACK', 'PROCESSING', 'IN_PROGRESS'];
const processingStatuses = ['PROCESSING', 'IN_PROGRESS'];
const canRetryStatuses = ['FAILED', 'CANCELLED', 'ASSIGNED', 'QUEUED', 'PENDING_ACK'];
const canApproveStatuses = ['REVIEW', 'IN_REVIEW', 'PENDING_RES'];
const reviewDefaultStatuses = ['REVIEW', 'IN_REVIEW', 'PENDING_RES', 'BLOCKED'];

// Helper to get latest progress
function getLatestProgress(task: Task) {
  const updates = getProgressUpdates(task);
  return updates.length > 0 ? updates[updates.length - 1] : null;
}

export const ExpandedCardView: React.FC<ExpandedCardViewProps> = ({
  task,
  onClose,
  onSendComment,
  onApproveTask,
  onRetryTask,
  onDeleteTask,
  onAddReviewComment,
  onRejectTask,
  onUnblockTask,
  onUpdateTask
}) => {
  // Computed permissions
  const canDelete = canDeleteStatuses.includes(task.status);
  const isProcessing = processingStatuses.includes(task.status);
  const canRetry = canRetryStatuses.includes(task.status);
  const canApprove = canApproveStatuses.includes(task.status);
  const canUnblock = task.status === 'BLOCKED';
  const defaultTab = reviewDefaultStatuses.includes(task.status) ? 'review' : 'prompt';
  const latestProgress = getLatestProgress(task);

  // Use custom hooks for state management
  const { messagesWidth, isDragging, startDragging } = useResizableWidth();
  const navigator = useDropdownState();
  const unblockModal = useModalWithField('');
  const rejectModal = useModalWithField('');

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Preview and file state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [fileStats, setFileStats] = useState<FileStats[]>([]);
  const [jumpToFile, setJumpToFile] = useState<((path: string) => void) | null>(null);

  // Modal handlers
  const handleUnblockConfirm = useCallback(() => {
    if (unblockModal.value.trim() && onUnblockTask) {
      onUnblockTask(task.id, unblockModal.value.trim());
      unblockModal.close();
      onClose();
    }
  }, [unblockModal, onUnblockTask, task.id, onClose]);

  const handleRejectConfirm = useCallback(() => {
    onRejectTask(task.id, rejectModal.value.trim() || 'Changes requested');
    rejectModal.close();
    onClose();
  }, [rejectModal, onRejectTask, task.id, onClose]);

  const handleJumpToFile = useCallback((path: string) => {
    jumpToFile?.(path);
    navigator.close();
  }, [jumpToFile, navigator]);

  const handleDeleteConfirm = useCallback(() => {
    onDeleteTask(task.id);
    setShowDeleteConfirm(false);
    onClose();
  }, [onDeleteTask, task.id, onClose]);

  return (
    <div
      key={task.id}
      className="absolute inset-0 z-20 bg-card border-2 border-primary flex flex-col animate-in zoom-in-95 duration-200 fill-mode-forwards shadow-lg shadow-primary/30"
      onClick={(e) => e.stopPropagation()}
    >
      <ExpandedCardHeader task={task}>
        <TaskActionButtons
          task={task}
          canApprove={canApprove}
          canUnblock={canUnblock}
          canRetry={canRetry}
          canDelete={canDelete}
          onApprove={(e) => { onApproveTask(e, task.id); onClose(); }}
          onReject={rejectModal.open}
          onUnblock={unblockModal.open}
          onRetry={(e) => { onRetryTask(e, task.id); onClose(); }}
          onDelete={() => setShowDeleteConfirm(true)}
          onClose={onClose}
          hasUnblockHandler={!!onUnblockTask}
        />
      </ExpandedCardHeader>

      <TaskProgressBar task={task} latestProgress={latestProgress} />

      <div className="flex-1 flex flex-row min-h-0">
        <Tabs defaultValue={defaultTab} className="flex-1 flex flex-col min-h-0 min-w-0">
          <TabsList className="bg-transparent border-b border-primary/20 w-full justify-start rounded-none p-0 h-auto gap-0 flex-shrink-0">
            <TabsTrigger value="prompt" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> PROMPT
            </TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> TIMELINE
            </TabsTrigger>
            <div className="relative flex items-stretch has-[[data-state=active]]:bg-primary/10">
              <TabsTrigger value="review" className="peer rounded-none border-b-2 border-transparent bg-transparent px-4 py-2 text-sm flex items-center gap-2 data-[state=active]:bg-transparent data-[state=active]:border-transparent">
                <CheckCircle className="h-4 w-4" /> REVIEW {fileStats.length > 0 && <span className="text-xs opacity-70">({fileStats.length})</span>}
              </TabsTrigger>
              <FileNavigator
                fileStats={fileStats}
                navigatorOpen={navigator.isOpen}
                onToggle={navigator.toggle}
                onJumpToFile={handleJumpToFile}
              />
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary hidden peer-data-[state=active]:block pointer-events-none" />
            </div>
            <TabsTrigger value="context" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> CONTEXT
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="prompt" className="m-0 p-4 h-full flex flex-col">
              <div className="flex-1 flex flex-col space-y-3 min-h-0">
                <div className="shrink-0">
                  <h3 className="text-sm font-bold text-primary/70 mb-1">TASK TITLE</h3>
                  <p className="font-bold text-lg">{formatTaskTitle(task)}</p>
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  <h3 className="text-sm font-bold text-primary/70 mb-1 shrink-0">FULL PROMPT</h3>
                  <pre className="whitespace-pre-wrap text-sm bg-black/30 p-4 border border-primary/20 flex-1 overflow-y-auto">{task.prompt}</pre>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="timeline" className="m-0 p-4 h-full">
              <TimelineTab task={task} />
            </TabsContent>

            <TabsContent value="review" className="m-0 p-4 h-full overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-primary/70 mb-2">REVIEW STATUS</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <Badge className={getStatusBadgeClass(task.status)}>{task.status}</Badge>
                    {task.assignedTo && <span className="text-xs text-primary/60">Assigned to: <span className="font-mono">{task.assignedTo}</span></span>}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary/70 mb-2">CODE CHANGES</h3>
                  <DiffViewer
                    taskId={task.id}
                    onAddComment={(filePath, lineNumber, content) => onAddReviewComment(task.id, filePath, lineNumber, content)}
                    onDiffLoaded={(stats, jump) => { setFileStats(stats); setJumpToFile(() => jump); }}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="context" className="m-0 p-4 h-full flex flex-col">
              <ContextTab task={task} onUpdateTask={onUpdateTask} />
            </TabsContent>
          </div>
        </Tabs>

        <div
          className={`w-1 bg-primary/20 hover:bg-primary/50 cursor-ew-resize flex-shrink-0 ${isDragging ? 'bg-primary' : ''}`}
          onMouseDown={startDragging}
        />

        <MessageThread task={task} width={messagesWidth} onSendComment={onSendComment} onPreviewImage={setPreviewImage} />
      </div>

      <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />

      <UnblockModal
        show={unblockModal.show}
        reason={unblockModal.value}
        onReasonChange={unblockModal.setValue}
        onConfirm={handleUnblockConfirm}
        onCancel={unblockModal.close}
      />

      <RejectModal
        show={rejectModal.show}
        feedback={rejectModal.value}
        onFeedbackChange={rejectModal.setValue}
        onConfirm={handleRejectConfirm}
        onCancel={rejectModal.close}
      />

      <DeleteConfirmModal
        show={showDeleteConfirm}
        isProcessing={isProcessing}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
