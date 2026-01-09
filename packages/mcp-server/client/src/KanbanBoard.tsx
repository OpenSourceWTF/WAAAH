
import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { XCircle, RefreshCw, History, X, Clock, User, FileText, Settings, MessageSquare } from "lucide-react";

interface Task {
  id: string;
  command: string;
  prompt: string;
  title?: string;
  status: string;
  toAgentId?: string;
  toAgentRole?: string;
  assignedTo?: string;
  context?: Record<string, unknown>;
  response?: Record<string, unknown>;
  messages?: { timestamp: number; role: string; content: string; metadata?: Record<string, unknown> }[];
  history?: { timestamp: number; status: string; agentId?: string; message?: string }[];
  createdAt?: number;
  completedAt?: number;
}

interface KanbanBoardProps {
  tasks: Task[];
  completedTasks: Task[];
  cancelledTasks: Task[];
  onCancelTask: (e: React.MouseEvent, id: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onViewHistory: () => void;
  onTaskClick?: (task: Task) => void;
}

const COLUMNS = [
  { id: 'TODO', label: 'TODO', statuses: ['QUEUED', 'PENDING_ACK'] },
  { id: 'IN_PROGRESS', label: 'IN PROGRESS', statuses: ['ASSIGNED', 'IN_PROGRESS', 'PROCESSING'] },
  { id: 'REVIEW', label: 'IN REVIEW', statuses: ['BLOCKED', 'PENDING_RES', 'REVIEW', 'IN_REVIEW', 'PENDING', 'APPROVED'] },
  { id: 'DONE', label: 'DONE', statuses: ['COMPLETED'] },
  { id: 'CANCELLED', label: 'CANCELLED', statuses: ['CANCELLED', 'FAILED'] }
];

export function KanbanBoard({ tasks, completedTasks, cancelledTasks, onCancelTask, onRetryTask, onViewHistory }: KanbanBoardProps) {
  // Expanded card state - null means no card expanded
  const [expandedTask, setExpandedTask] = useState<Task | null>(null);

  // Group tasks by column
  const columns = useMemo(() => {
    const cols: Record<string, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [...completedTasks],
      CANCELLED: [...cancelledTasks]
    };

    tasks.forEach(task => {
      const col = COLUMNS.find(c => c.statuses.includes(task.status));
      if (col) {
        if (col.id === 'DONE') return;
        cols[col.id].push(task);
      } else {
        if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status)) {
          cols['REVIEW'].push(task);
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

  // Unified styling with Dashboard cards (per Task 1)
  const getStatusBadgeClass = (status: string) => {
    const base = "text-xs font-bold px-2 py-1 border border-black";
    switch (status) {
      case 'COMPLETED': return `${base} bg-green-600 text-white border-green-800`;
      case 'FAILED':
      case 'CANCELLED': return `${base} bg-red-600 text-white border-red-800`;
      case 'ASSIGNED':
      case 'IN_PROGRESS':
      case 'PROCESSING': return `${base} bg-blue-600 text-white border-blue-800`;
      case 'QUEUED':
      case 'PENDING_ACK':
      case 'WAITING': return `${base} bg-yellow-500 text-black border-yellow-700`;
      case 'BLOCKED':
      case 'PENDING':
      case 'PENDING_RES':
      case 'REVIEW':
      case 'IN_REVIEW':
      case 'APPROVED': return `${base} bg-white text-black border-gray-400`;
      default: return `${base} bg-gray-600 text-white`;
    }
  };

  const formatDate = (ts?: number) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  };

  const getDuration = (start?: number, end?: number) => {
    if (!start) return '';
    const endTime = end || Date.now();
    const diff = Math.max(0, endTime - start);
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (mins > 60) {
      const hours = Math.floor(mins / 60);
      return `${hours}h ${mins % 60}m`;
    }
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatTaskTitle = (task: Task) => {
    if (task.title) return task.title;
    if (task.prompt) {
      const firstLine = task.prompt.split('\n')[0].trim();
      return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
    }
    return task.command || 'Untitled Task';
  };

  const formatResponse = (response: Record<string, unknown> | string | null | undefined): string => {
    if (!response) return 'No output yet.';
    if (typeof response === 'string') return response;
    if (response.output && typeof response.output === 'string') return response.output;
    if (response.message && typeof response.message === 'string') return response.message;
    if (response.content && typeof response.content === 'string') return response.content;
    if (response.error && typeof response.error === 'string') return `ERROR: ${response.error}`;
    return JSON.stringify(response, null, 2);
  };

  // Extract progress updates from messages
  const getProgressUpdates = (task: Task) => {
    if (!task.messages) return [];
    return task.messages.filter(m =>
      m.role === 'agent' && m.metadata && (m.metadata as any).percentage !== undefined
    );
  };

  const handleCardClick = (task: Task) => {
    setExpandedTask(task);
  };

  const handleCloseExpanded = () => {
    setExpandedTask(null);
  };

  // Expanded Card View Component
  const ExpandedCardView = ({ task }: { task: Task }) => {
    const progressUpdates = getProgressUpdates(task);
    const latestProgress = progressUpdates.length > 0 ? progressUpdates[progressUpdates.length - 1] : null;
    const canCancel = ['QUEUED', 'ASSIGNED', 'PENDING_ACK', 'PROCESSING', 'IN_PROGRESS'].includes(task.status);
    const canRetry = ['FAILED', 'CANCELLED', 'ASSIGNED', 'QUEUED', 'PENDING_ACK'].includes(task.status);

    return (
      <div
        className="absolute inset-0 z-20 bg-card border-2 border-primary flex flex-col shadow-lg shadow-primary/30"
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
                {getDuration(task.createdAt)}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary hover:text-red-500 hover:bg-red-500/10"
              onClick={handleCloseExpanded}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Progress Bar (if available) */}
        {latestProgress && (
          <div className="px-4 py-2 bg-primary/5 border-b border-primary/20 flex-shrink-0">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-primary/70">
                {(latestProgress.metadata as any)?.phase || 'In Progress'}
              </span>
              <span className="font-mono text-primary">
                {(latestProgress.metadata as any)?.percentage || 0}%
              </span>
            </div>
            <div className="h-1 bg-primary/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${(latestProgress.metadata as any)?.percentage || 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Tabbed Content */}
        <Tabs defaultValue="prompt" className="flex-1 flex flex-col min-h-0">
          <TabsList className="bg-transparent border-b border-primary/20 w-full justify-start rounded-none p-0 h-auto gap-0 flex-shrink-0">
            <TabsTrigger
              value="prompt"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Prompt
            </TabsTrigger>
            <TabsTrigger
              value="context"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2"
            >
              <Settings className="h-4 w-4" />
              Context
            </TabsTrigger>
            <TabsTrigger
              value="output"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/10 px-4 py-2 text-sm flex items-center gap-2"
            >
              <MessageSquare className="h-4 w-4" />
              Output
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            {/* PROMPT TAB */}
            <TabsContent value="prompt" className="m-0 p-4 h-full">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-primary/70 mb-2">TASK TITLE</h3>
                  <p className="font-bold text-lg">{formatTaskTitle(task)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary/70 mb-2">FULL PROMPT</h3>
                  <pre className="whitespace-pre-wrap text-sm bg-black/30 p-4 border border-primary/20 max-h-[300px] overflow-y-auto">
                    {task.prompt}
                  </pre>
                </div>
                {/* Timeline of progress updates */}
                {progressUpdates.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-primary/70 mb-2">PROGRESS UPDATES</h3>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                      {progressUpdates.map((update, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-xs bg-primary/5 p-2 border-l-2 border-primary/50 animate-in slide-in-from-left duration-300"
                          style={{ animationDelay: `${i * 50}ms` }}
                        >
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {(update.metadata as any)?.percentage || 0}%
                          </Badge>
                          <span className="text-primary/80">{update.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* CONTEXT TAB */}
            <TabsContent value="context" className="m-0 p-4 h-full">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-primary/70 mb-2">TASK METADATA</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">ID:</span>
                      <p className="font-mono text-xs break-all">{task.id}</p>
                    </div>
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">Status:</span>
                      <p className="font-mono">{task.status}</p>
                    </div>
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">Created:</span>
                      <p className="font-mono text-xs">{formatDate(task.createdAt)}</p>
                    </div>
                    <div className="bg-black/30 p-2 border border-primary/20">
                      <span className="text-primary/50 text-xs">Assigned To:</span>
                      <p className="font-mono text-xs">{task.assignedTo || task.toAgentId || 'Unassigned'}</p>
                    </div>
                  </div>
                </div>
                {task.context && (
                  <div>
                    <h3 className="text-sm font-bold text-primary/70 mb-2">CONTEXT OBJECT</h3>
                    <pre className="text-xs bg-black/30 p-4 border border-primary/20 overflow-auto max-h-[300px] whitespace-pre-wrap">
                      {JSON.stringify(task.context, null, 2)}
                    </pre>
                  </div>
                )}
                {/* Task History */}
                {task.history && task.history.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-primary/70 mb-2">HISTORY</h3>
                    <div className="space-y-1 max-h-[200px] overflow-y-auto border-l-2 border-primary/20 pl-4">
                      {task.history.map((h, i) => (
                        <div key={i} className="text-xs flex items-center gap-2">
                          <span className="text-primary/40 font-mono shrink-0">
                            {new Date(h.timestamp).toLocaleTimeString()}
                          </span>
                          <Badge className={getStatusBadgeClass(h.status)}>{h.status}</Badge>
                          {h.message && <span className="text-primary/60 truncate">{h.message}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* OUTPUT TAB */}
            <TabsContent value="output" className="m-0 p-4 h-full">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-primary/70 mb-2">RESPONSE</h3>
                  <pre className="text-xs bg-black/30 p-4 border border-primary/20 overflow-auto max-h-[200px] whitespace-pre-wrap">
                    {formatResponse(task.response)}
                  </pre>
                </div>
                {/* Messages / Timeline */}
                {task.messages && task.messages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-primary/70 mb-2">MESSAGES ({task.messages.length})</h3>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {task.messages.map((msg, i) => (
                        <div
                          key={i}
                          className={`text-xs p-2 border-l-2 ${msg.role === 'user' ? 'border-blue-500 bg-blue-500/10' :
                            msg.role === 'agent' ? 'border-primary bg-primary/5' :
                              'border-gray-500 bg-gray-500/5'
                            }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{msg.role}</Badge>
                            <span className="text-primary/40 font-mono">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-primary/80 whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Action Footer */}
        {(canCancel || canRetry) && (
          <div className="flex justify-end gap-2 p-4 border-t border-primary/20 bg-primary/5 flex-shrink-0">
            {canRetry && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 font-mono uppercase border-primary text-primary hover:bg-primary hover:text-black"
                onClick={(e) => { onRetryTask(e, task.id); handleCloseExpanded(); }}
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-2 font-mono uppercase bg-red-600 hover:bg-red-700 text-white"
                onClick={(e) => { onCancelTask(e, task.id); handleCloseExpanded(); }}
              >
                <XCircle className="h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative flex h-full gap-4 overflow-x-auto pb-4">
      {/* Backdrop when expanded */}
      {expandedTask && (
        <div
          className="absolute inset-0 z-10 bg-black/50 backdrop-blur-sm"
          onClick={handleCloseExpanded}
        />
      )}

      {/* Expanded Card Overlay */}
      {expandedTask && (
        <div className="absolute inset-4 z-20">
          <ExpandedCardView task={expandedTask} />
        </div>
      )}

      {/* Columns */}
      {COLUMNS.map(col => (
        <div key={col.id} className="flex-1 min-w-[300px] flex flex-col h-full bg-primary/5 border border-primary/20 rounded-sm">
          {/* Column Header */}
          <div className="p-3 border-b-2 border-primary/30 bg-primary/10 flex justify-between items-center sticky top-0 backdrop-blur-sm z-[5]">
            <h3 className="font-bold text-lg tracking-widest">{col.label}</h3>
            <Badge variant="outline" className="border-primary text-primary bg-black/50">
              {columns[col.id]?.length || 0}
            </Badge>
          </div>

          {/* Column Content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3 scrollbar-thin scrollbar-thumb-primary/50 scrollbar-track-transparent">
            {columns[col.id]?.map(task => (
              <Card
                key={task.id}
                className={`border-2 border-primary/50 bg-card hover:bg-primary/5 transition-all duration-200 shadow-sm rounded-none cursor-pointer hover:border-primary hover:scale-[1.02] hover:shadow-md hover:shadow-primary/20`}
                onClick={() => handleCardClick(task)}
              >
                {/* Unified styling with Dashboard cards */}
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-mono text-primary/70 break-all">{task.id}</span>
                    <Badge className={getStatusBadgeClass(task.status)}>{task.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  {/* Title with left border accent (unified with Dashboard) */}
                  <p className="font-bold text-sm mb-2 line-clamp-3 border-l-4 border-primary pl-2 text-foreground" title={formatTaskTitle(task)}>{formatTaskTitle(task)}</p>

                  <div className="text-xs text-primary/60 mb-2">
                    {(task.assignedTo || task.toAgentId) && <div>Agent: {task.assignedTo || task.toAgentId}</div>}
                  </div>

                  {/* Progress indicator */}
                  {(() => {
                    const updates = getProgressUpdates(task);
                    if (updates.length > 0) {
                      const latest = updates[updates.length - 1];
                      const pct = (latest.metadata as any)?.percentage || 0;
                      return (
                        <div className="mb-2">
                          <div className="flex justify-between text-[10px] text-primary/50 mb-0.5">
                            <span>{(latest.metadata as any)?.phase || 'Progress'}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1 bg-primary/20 rounded-full overflow-hidden">
                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Timestamps & Duration */}
                  <div
                    className="mt-2 pt-2 border-t border-primary/10 grid grid-cols-2 gap-y-1 text-[10px] text-primary/50 font-mono cursor-text"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {task.createdAt && (
                      <div className="col-span-2">Created: {formatDate(task.createdAt)}</div>
                    )}
                    {(['COMPLETED', 'FAILED'].includes(task.status) && task.completedAt) && (
                      <div className="col-span-2 text-primary/70">
                        Finished: {formatDate(task.completedAt)}
                        <span className="ml-1 text-primary/90">({getDuration(task.createdAt, task.completedAt)})</span>
                      </div>
                    )}
                    {(!['COMPLETED', 'FAILED', 'CANCELLED', 'QUEUED'].includes(task.status) && task.createdAt) && (
                      <div className="col-span-2 text-blue-500/80">
                        Running: {getDuration(task.createdAt)}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 mt-2">
                    {(['QUEUED', 'ASSIGNED', 'PENDING_ACK', 'PROCESSING', 'IN_PROGRESS'].includes(task.status)) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-red-500 hover:text-white hover:bg-red-600"
                        onClick={(e) => { e.stopPropagation(); onCancelTask(e, task.id); }}
                        title="Cancel Task"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {(['FAILED', 'CANCELLED', 'ASSIGNED', 'QUEUED', 'PENDING_ACK'].includes(task.status)) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-primary hover:text-black hover:bg-primary"
                        onClick={(e) => { e.stopPropagation(); onRetryTask(e, task.id); }}
                        title="Retry Task"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {columns[col.id]?.length === 0 && (
              <div className="text-center p-4 opacity-30 text-xs italic">
                NO TASKS IN {col.label}
              </div>
            )}

            {col.id === 'DONE' && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" onClick={onViewHistory} className="w-full border-dashed border-primary/50 text-primary/70 hover:text-primary hover:border-primary">
                  <History className="h-4 w-4 mr-2" />
                  VIEW ALL HISTORY
                </Button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

