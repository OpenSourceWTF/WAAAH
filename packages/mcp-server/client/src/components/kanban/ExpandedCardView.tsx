import React, { useState, useEffect } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { X, Clock, User, FileText, Settings, CheckCircle, RefreshCw, XCircle, ChevronDown } from "lucide-react";
import { DiffViewer } from "@/components/DiffViewer";
import type { Task } from './types';
import { getStatusBadgeClass, formatDate, getTaskDuration, formatTaskTitle, getProgressUpdates } from './utils';
import { ImagePreviewModal } from './ImagePreviewModal';
import { MessageThread } from './MessageThread';

interface ExpandedCardViewProps {
  task: Task;
  onClose: () => void;
  onSendComment: (taskId: string, content: string, replyTo?: string, images?: Array<{ id: string; dataUrl: string; mimeType: string; name: string }>) => void;
  onApproveTask: (e: React.MouseEvent, id: string) => void;
  onRejectTask: (id: string, feedback: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onCancelTask: (e: React.MouseEvent, id: string) => void;
  onAddReviewComment: (taskId: string, filePath: string, lineNumber: number | null, content: string) => void;
}

export const ExpandedCardView: React.FC<ExpandedCardViewProps> = ({
  task,
  onClose,
  onSendComment,
  onApproveTask,
  onRetryTask,
  onCancelTask,
  onAddReviewComment
}) => {
  const progressUpdates = getProgressUpdates(task) || [];
  const latestProgress = progressUpdates.length > 0 ? progressUpdates[progressUpdates.length - 1] : null;
  const canCancel = ['QUEUED', 'ASSIGNED', 'PENDING_ACK', 'PROCESSING', 'IN_PROGRESS'].includes(task.status);
  const canRetry = ['FAILED', 'CANCELLED', 'ASSIGNED', 'QUEUED', 'PENDING_ACK'].includes(task.status);
  const canApprove = ['REVIEW', 'IN_REVIEW', 'PENDING_RES', 'BLOCKED'].includes(task.status);

  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Resizable messenger width (persisted)
  const [messagesWidth, setMessagesWidth] = useState(() => {
    const saved = localStorage.getItem('waaah-messages-width');
    return saved ? Math.max(300, Math.min(700, parseInt(saved, 10))) : 400;
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 20;
      setMessagesWidth(Math.max(300, Math.min(700, newWidth)));
    };
    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem('waaah-messages-width', String(messagesWidth));
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, messagesWidth]);

  // File navigator state
  const [fileStats, setFileStats] = useState<import('@/utils/diffParser').FileStats[]>([]);
  const [jumpToFile, setJumpToFile] = useState<((path: string) => void) | null>(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);

  // Close navigator when clicking outside (simple version)
  useEffect(() => {
    if (navigatorOpen) {
      const close = () => setNavigatorOpen(false);
      document.addEventListener('click', close);
      return () => document.removeEventListener('click', close);
    }
  }, [navigatorOpen]);

  return (
    <div
      key={task.id}
      className="absolute inset-0 z-20 bg-card border-2 border-primary flex flex-col animate-in zoom-in-95 duration-200 fill-mode-forwards shadow-lg shadow-primary/30"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b-2 border-primary/30 bg-primary/10 flex-shrink-0">
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
          {/* Action buttons in header */}
          {canApprove && (
            <Button variant="default" size="sm" className="h-8 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={(e) => { onApproveTask(e, task.id); onClose(); }}>
              <CheckCircle className="h-3 w-3" /> Approve
            </Button>
          )}
          {canRetry && (
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs border-primary text-primary hover:bg-primary hover:text-black"
              onClick={(e) => { onRetryTask(e, task.id); onClose(); }}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" size="sm" className="h-8 gap-1 text-xs bg-red-600 hover:bg-red-700"
              onClick={(e) => { onCancelTask(e, task.id); onClose(); }}>
              <XCircle className="h-3 w-3" /> Cancel
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
        </div>
      </div>

      {/* Progress Bar */}
      {latestProgress && (
        <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex-shrink-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-primary/70">
              {['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status)
                ? (task.status === 'COMPLETED' ? 'Complete' : task.status)
                : ((latestProgress.metadata as Record<string, unknown>)?.phase as string || 'In Progress')}
            </span>
            <span className="font-mono text-primary">
              {['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) ? '100' : (Number((latestProgress.metadata as Record<string, unknown>)?.percentage) || 0)}%
            </span>
          </div>
          <div className="h-1 bg-primary/20 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ease-out ${task.status === 'COMPLETED' ? 'bg-green-500' :
                ['FAILED', 'CANCELLED'].includes(task.status) ? 'bg-red-500' : 'bg-primary'}`}
              style={{ width: `${['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) ? 100 : ((latestProgress.metadata as Record<string, unknown>)?.percentage || 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Bilateral Layout */}
      <div className="flex-1 flex flex-row min-h-0">
        {/* Left Column: Tabs */}
        <Tabs
          defaultValue={['REVIEW', 'IN_REVIEW', 'PENDING_RES', 'BLOCKED'].includes(task.status) ? 'review' : 'prompt'}
          className="flex-1 flex flex-col min-h-0 min-w-0"
        >
          <TabsList className="bg-transparent border-b border-primary/20 w-full justify-start rounded-none p-0 h-auto gap-0 flex-shrink-0">
            <TabsTrigger value="prompt" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" /> PROMPT
            </TabsTrigger>

            <TabsTrigger value="timeline" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" /> TIMELINE
            </TabsTrigger>

            <div className="relative flex items-center border-b-2 border-transparent has-[[data-state=active]]:border-primary has-[[data-state=active]]:bg-primary/10">
              <TabsTrigger value="review" className="rounded-none border-b-0 border-transparent bg-transparent px-4 py-2 text-sm flex items-center gap-2 data-[state=active]:bg-transparent">
                <CheckCircle className="h-4 w-4" /> REVIEW {fileStats.length > 0 && <span className="text-xs opacity-70">({fileStats.length})</span>}
              </TabsTrigger>
              {fileStats.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setNavigatorOpen(!navigatorOpen); }}
                    className="h-9 w-9 border-l border-r border-primary/20 flex items-center justify-center hover:bg-primary/20 text-primary/70 hover:text-primary transition-colors focus:outline-none"
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
                            onClick={() => { jumpToFile?.(stat.path); setNavigatorOpen(false); }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-mono text-primary truncate" title={stat.path}>{stat.path.split('/').pop()}</p>
                              <p className="text-[10px] text-primary/40 truncate">{stat.path}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {stat.additions > 0 && <span className="text-[10px] text-green-400">+{stat.additions}</span>}
                              {stat.deletions > 0 && <span className="text-[10px] text-red-400">−{stat.deletions}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <TabsTrigger value="context" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2">
              <Settings className="h-4 w-4" /> CONTEXT
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {/* PROMPT TAB */}
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



            {/* TIMELINE TAB - Interleaved chronological view */}
            <TabsContent value="timeline" className="m-0 p-4 h-full">
              <div className="space-y-2 max-h-full overflow-y-auto">
                {(() => {
                  type TimelineItem =
                    | { type: 'progress'; data: NonNullable<typeof task.messages>[0]; timestamp: number }
                    | { type: 'status'; data: NonNullable<typeof task.history>[0]; timestamp: number };

                  const items: TimelineItem[] = [];

                  // Add progress updates only (agent messages with percentage)
                  task.messages?.forEach(msg => {
                    const percentage = (msg.metadata as Record<string, unknown>)?.percentage;
                    if (msg.role === 'agent' && percentage !== undefined) {
                      items.push({ type: 'progress', data: msg, timestamp: msg.timestamp });
                    }
                  });

                  // Add status history events
                  task.history?.forEach(evt => {
                    items.push({ type: 'status', data: evt, timestamp: evt.timestamp });
                  });

                  // Sort chronologically
                  items.sort((a, b) => a.timestamp - b.timestamp);

                  if (items.length === 0) {
                    return <div className="text-center p-8 text-primary/40 italic">No timeline events available</div>;
                  }

                  return items.map((item, idx) => {
                    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                    if (item.type === 'status') {
                      const evt = item.data;
                      return (
                        <div key={`status-${idx}`} className="flex items-center gap-3 text-sm py-1 px-2 border-l-2 border-primary/30 bg-primary/5">
                          <span className="h-2 w-2 rounded-full bg-primary/50 shrink-0" />
                          <span className="text-primary/40 font-mono shrink-0">{time}</span>
                          <Badge className={getStatusBadgeClass(evt.status)}>{evt.status}</Badge>
                          {evt.agentId && <span className="text-primary/50">{evt.agentId}</span>}
                          {evt.message && <span className="text-primary/60 truncate">{evt.message}</span>}
                        </div>
                      );
                    }

                    // Progress update
                    const msg = item.data;
                    const percentage = (msg.metadata as Record<string, unknown>)?.percentage as number;

                    return (
                      <div key={`progress-${idx}`} className="text-sm p-2 border-l-2 border-green-500 bg-green-500/10">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px] border-green-500 text-green-400">PROGRESS</Badge>
                          <span className="text-primary/40 font-mono">{time}</span>
                          <span className="text-green-400 font-bold">{percentage}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/30 mb-1">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${percentage}%` }} />
                        </div>
                        <p className="text-primary/80 whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    );
                  });
                })()}
              </div>
            </TabsContent>

            {/* REVIEW TAB */}
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

            {/* CONTEXT TAB */}
            <TabsContent value="context" className="m-0 p-4 h-full flex flex-col">
              <div className="flex-1 flex flex-col space-y-3 min-h-0">
                <div className="shrink-0">
                  <h3 className="text-sm font-bold text-primary/70 mb-1">TASK METADATA</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">ID:</span>
                      <p className="font-mono text-sm break-all">{task.id}</p>
                    </div>
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">Status:</span>
                      <p className="font-mono text-sm">{task.status}</p>
                    </div>
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">Created:</span>
                      <p className="font-mono text-sm">{formatDate(task.createdAt)}</p>
                    </div>
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">Assigned To:</span>
                      <p className="font-mono text-sm">{task.assignedTo || task.toAgentId || 'Unassigned'}</p>
                    </div>
                  </div>
                </div>
                {task.context && (
                  <div className="flex-1 flex flex-col min-h-0">
                    <h3 className="text-sm font-bold text-primary/70 mb-1 shrink-0">CONTEXT OBJECT</h3>
                    <pre className="whitespace-pre-wrap text-sm bg-black/30 p-4 border border-primary/20 flex-1 overflow-y-auto">{JSON.stringify(task.context, null, 2)}</pre>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Drag Handle */}
        <div className={`w-1 bg-primary/20 hover:bg-primary/50 cursor-ew-resize flex-shrink-0 ${isDragging ? 'bg-primary' : ''}`} onMouseDown={() => setIsDragging(true)} />

        {/* Right Column: Message Thread */}
        <MessageThread task={task} width={messagesWidth} onSendComment={onSendComment} onPreviewImage={setPreviewImage} />
      </div>

      <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
};
