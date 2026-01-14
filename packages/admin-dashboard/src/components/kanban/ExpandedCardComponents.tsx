/**
 * Extracted sub-components for ExpandedCardView
 * Reduces complexity of the main component
 */
import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Clock, User, CheckCircle, RefreshCw, Trash2, ChevronDown, RotateCcw, AlertTriangle } from "lucide-react";
import type { Task } from './types';
import { getStatusBadgeClass, getTaskDuration } from './utils';
import type { FileStats } from '@/utils/diffParser';

// ============================================
// TaskActionButtons - Action buttons in header
// ============================================
interface TaskActionButtonsProps {
  task: Task;
  canApprove: boolean;
  canUnblock: boolean;
  canRetry: boolean;
  canDelete: boolean;
  onApprove: (e: React.MouseEvent) => void;
  onReject: () => void;
  onUnblock: () => void;
  onRetry: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onClose: () => void;
  hasUnblockHandler: boolean;
}

export const TaskActionButtons: React.FC<TaskActionButtonsProps> = ({
  canApprove,
  canUnblock,
  canRetry,
  canDelete,
  onApprove,
  onReject,
  onUnblock,
  onRetry,
  onDelete,
  onClose,
  hasUnblockHandler,
}) => (
  <>
    {canApprove && (
      <Button variant="default" size="sm" className="h-8 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white uppercase"
        onClick={onApprove}>
        <CheckCircle className="h-3 w-3" /> APPROVE
      </Button>
    )}
    {canApprove && (
      <Button variant="default" size="sm" className="h-8 gap-1 text-xs bg-purple-600 hover:bg-purple-700 text-white uppercase"
        onClick={onReject}>
        <RotateCcw className="h-3 w-3" /> REJECT
      </Button>
    )}
    {canUnblock && hasUnblockHandler && (
      <Button variant="default" size="sm" className="h-8 gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white uppercase"
        onClick={onUnblock}>
        <RefreshCw className="h-3 w-3" /> UNBLOCK
      </Button>
    )}
    {canRetry && (
      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-primary text-primary hover:bg-primary hover:text-black uppercase"
        onClick={onRetry}>
        <RefreshCw className="h-3 w-3" /> RETRY
      </Button>
    )}
    {canDelete && (
      <Button variant="destructive" size="sm" className="h-8 gap-1 text-xs bg-red-600 hover:bg-red-700 uppercase"
        onClick={onDelete}>
        <Trash2 className="h-3 w-3" /> DELETE
      </Button>
    )}
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-primary hover:text-red-500 hover:bg-red-500/10"
      onClick={onClose}
    >
      <X className="h-5 w-5" />
    </Button>
  </>
);

// ============================================
// ExpandedCardHeader - Header section
// ============================================
interface ExpandedCardHeaderProps {
  task: Task;
  children: React.ReactNode; // Action buttons
}

export const ExpandedCardHeader: React.FC<ExpandedCardHeaderProps> = ({ task, children }) => (
  <div className="flex items-center justify-between py-2 px-4 border-b-2 border-primary/30 bg-primary/10 flex-shrink-0">
    <div className="flex items-center gap-3">
      <Badge className={getStatusBadgeClass(task.status)}>{task.status}</Badge>
      <span className="font-mono text-xs text-primary/70">{task.id}</span>
    </div>
    <div className="flex items-center gap-2">
      {task.assignedTo && (
        <Badge variant="outline" className="text-xs border-primary/50">
          <User className="h-3 w-3 mr-1" />
          {task.assignedTo}
        </Badge>
      )}
      {task.createdAt && (
        <Badge variant="outline" className="text-xs border-primary/30">
          <Clock className="h-3 w-3 mr-1" />
          {getTaskDuration(task)}
        </Badge>
      )}
      {children}
    </div>
  </div>
);

// ============================================
// TaskProgressBar - Progress display
// ============================================
interface TaskProgressBarProps {
  task: Task;
  latestProgress: { metadata: unknown } | null;
}

export const TaskProgressBar: React.FC<TaskProgressBarProps> = ({ task, latestProgress }) => {
  if (!latestProgress) return null;

  const metadata = latestProgress.metadata as Record<string, unknown>;
  const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status);
  const phase = isTerminal
    ? (task.status === 'COMPLETED' ? 'Complete' : task.status)
    : ((metadata?.phase as string) || 'In Progress');
  const percentage = isTerminal ? 100 : (Number(metadata?.percentage) || 0);
  const barColor = task.status === 'COMPLETED' ? 'bg-green-500' :
    ['FAILED', 'CANCELLED'].includes(task.status) ? 'bg-red-500' : 'bg-primary';

  return (
    <div className="px-4 py-1 bg-primary/5 border-b border-primary/20 flex-shrink-0">
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-primary/70">{phase}</span>
        <span className="font-mono text-primary">{percentage}%</span>
      </div>
      <div className="h-1 bg-primary/20 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ease-out ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

// ============================================
// FileNavigator - Dropdown for diff file navigation
// ============================================
interface FileNavigatorProps {
  fileStats: FileStats[];
  navigatorOpen: boolean;
  onToggle: () => void;
  onJumpToFile: (path: string) => void;
}

export const FileNavigator: React.FC<FileNavigatorProps> = ({
  fileStats,
  navigatorOpen,
  onToggle,
  onJumpToFile,
}) => {
  if (fileStats.length <= 1) return null;

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="w-9 border-l border-r border-primary/20 flex items-center justify-center hover:bg-primary/20 text-primary/70 hover:text-primary transition-colors focus:outline-none"
      >
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${navigatorOpen ? 'rotate-180' : ''}`} />
      </button>
      {navigatorOpen && (
        <div className="absolute top-full left-0 mt-0 w-64 bg-popover/95 backdrop-blur z-50 shadow-xl border border-primary/20 rounded-b-md overflow-hidden flex flex-col max-h-[60vh] animate-in slide-in-from-top-2 fade-in zoom-in-95 duration-200">
          <div className="overflow-y-auto p-1 bg-background">
            {fileStats.map(stat => (
              <button
                key={stat.path}
                className="w-full text-left px-2 py-1.5 hover:bg-primary/10 flex items-center gap-2 group border-b border-primary/10 last:border-0"
                onClick={() => onJumpToFile(stat.path)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-primary truncate" title={stat.path}>{stat.path.split('/').pop()}</p>
                  <p className="text-compact text-primary/40 truncate">{stat.path}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {stat.additions > 0 && <span className="text-compact text-green-400">+{stat.additions}</span>}
                  {stat.deletions > 0 && <span className="text-compact text-red-400">−{stat.deletions}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ============================================
// UnblockModal - Modal for unblocking tasks
// ============================================
interface UnblockModalProps {
  show: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const UnblockModal: React.FC<UnblockModalProps> = ({
  show,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border-2 border-orange-500 p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-bold text-orange-500 mb-4">Unblock Task</h3>
        <p className="text-sm text-primary/70 mb-4">
          Provide clarification or answer to help the agent proceed:
        </p>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Enter reason for unblocking (required)..."
          className="w-full h-24 p-3 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-orange-500 resize-none"
          autoFocus
        />
        <div className="flex gap-3 mt-4 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-primary/30 text-primary/70 hover:bg-primary/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim()}
            className="px-4 py-2 text-sm bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
          >
            Unblock Task
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// RejectModal - Modal for rejecting/requesting changes
// ============================================
interface RejectModalProps {
  show: boolean;
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  show,
  feedback,
  onFeedbackChange,
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border-2 border-purple-500 p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-bold text-purple-500 mb-4">REQUEST CHANGES</h3>
        <p className="text-sm text-primary/70 mb-4">
          Provide feedback on what needs to be fixed (optional if review comments exist).
        </p>
        <textarea
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          placeholder="What's wrong? What needs to be fixed? (optional)..."
          className="w-full h-32 p-3 text-sm bg-black/30 border border-primary/30 text-foreground placeholder:text-primary/40 focus:outline-none focus:border-purple-500 resize-none"
          autoFocus
        />
        <div className="flex gap-3 mt-4 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-primary/30 text-primary/70 hover:bg-primary/10 uppercase"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-purple-600 text-white hover:bg-purple-700 uppercase"
          >
            REQUEST CHANGES
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// DeleteConfirmModal - Modal for permanently deleting tasks
// ============================================
interface DeleteConfirmModalProps {
  show: boolean;
  isProcessing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  show,
  isProcessing,
  onConfirm,
  onCancel,
}) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border-2 border-red-500 p-6 rounded-lg shadow-lg max-w-md w-full">
        <h3 className="text-lg font-bold text-red-500 mb-4 flex items-center gap-2">
          <Trash2 className="h-5 w-5" /> DELETE TASK
        </h3>
        <p className="text-sm text-primary/70 mb-4">
          Delete permanently? This cannot be undone.
        </p>
        {isProcessing && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-yellow-500/10 border border-yellow-500/50 rounded text-yellow-500 text-sm">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Task is currently processing</span>
          </div>
        )}
        <div className="flex gap-3 mt-4 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-primary/30 text-primary/70 hover:bg-primary/10 uppercase"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 uppercase"
          >
            Delete Permanently
          </button>
        </div>
      </div>
    </div>
  );
};
