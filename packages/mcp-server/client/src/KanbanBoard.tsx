
import React, { useMemo } from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { XCircle, RefreshCw, History } from "lucide-react";


interface Task {
  id: string;
  command: string;
  prompt: string;
  title?: string;
  status: string;
  toAgentId?: string;
  toAgentRole?: string;
  createdAt?: number;
  completedAt?: number;
}

interface KanbanBoardProps {
  tasks: Task[]; // Active tasks from Dashboard
  completedTasks: Task[]; // Last 10 completed tasks
  cancelledTasks: Task[]; // Last 10 cancelled/failed tasks
  onCancelTask: (e: React.MouseEvent, id: string) => void;
  onRetryTask: (e: React.MouseEvent, id: string) => void;
  onViewHistory: () => void;
  onTaskClick?: (task: Task) => void;
}

const COLUMNS = [
  { id: 'TODO', label: 'TODO', statuses: ['QUEUED', 'PENDING_ACK'] },
  { id: 'IN_PROGRESS', label: 'IN PROGRESS', statuses: ['ASSIGNED', 'IN_PROGRESS', 'PROCESSING'] },
  { id: 'REVIEW', label: 'IN REVIEW', statuses: ['BLOCKED', 'PENDING_RES', 'REVIEW', 'IN_REVIEW', 'PENDING'] },
  { id: 'DONE', label: 'DONE', statuses: ['COMPLETED'] },
  { id: 'CANCELLED', label: 'CANCELLED', statuses: ['CANCELLED', 'FAILED'] }
];

export function KanbanBoard({ tasks, completedTasks, cancelledTasks, onCancelTask, onRetryTask, onViewHistory, onTaskClick }: KanbanBoardProps) {

  // Group tasks by column
  const columns = useMemo(() => {
    const cols: Record<string, Task[]> = {
      TODO: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [...completedTasks], // Pre-fill with passed completed tasks
      CANCELLED: [...cancelledTasks]
    };

    tasks.forEach(task => {
      // Find which column this task belongs to
      const col = COLUMNS.find(c => c.statuses.includes(task.status));
      if (col) {
        // Avoid duplicates if 'COMPLETED' is in tasks (unlikely given Dashboard logic, but safe)
        if (col.id === 'DONE') return;
        cols[col.id].push(task);
      } else {
        // Fallback for unknown statuses? Maybe TODO or REVIEW?
        // For now, let's dump them in REVIEW if not terminal
        if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status)) {
          cols['REVIEW'].push(task);
        }
      }
    });

    // Also add failed/cancelled from active list if they exist (Dashboard filters them out usually, but good to be robust)
    tasks.forEach(task => {
      if (['CANCELLED', 'FAILED'].includes(task.status)) {
        cols['CANCELLED'].push(task);
      }
    });

    return cols;
  }, [tasks, completedTasks, cancelledTasks]);

  const getStatusBadgeClass = (status: string) => {
    const base = "text-[10px] font-bold px-1 py-0.5 border border-black";
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
      case 'REVIEW': return `${base} bg-white text-black border-gray-400`;
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

  // Format task title: task.title || truncated prompt || command
  const formatTaskTitle = (task: Task) => {
    if (task.title) return task.title;
    if (task.prompt) {
      const firstLine = task.prompt.split('\n')[0].trim();
      return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
    }
    return task.command || 'Untitled Task';
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-4">
      {COLUMNS.map(col => (
        <div key={col.id} className="flex-1 min-w-[300px] flex flex-col h-full bg-primary/5 border border-primary/20 rounded-sm">
          {/* Column Header */}
          <div className="p-3 border-b-2 border-primary/30 bg-primary/10 flex justify-between items-center sticky top-0 backdrop-blur-sm z-10">
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
                className={`border border-primary/50 bg-card hover:bg-primary/10 transition-colors shadow-sm rounded-none ${onTaskClick ? 'cursor-pointer hover:border-primary' : ''}`}
                onClick={() => onTaskClick?.(task)}
              >
                <CardHeader className="p-3 pb-0">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-mono text-primary/70 break-all">{task.id}</span>
                    <Badge className={getStatusBadgeClass(task.status)}>{task.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-3 pt-2">
                  <p className="font-bold text-sm mb-2 line-clamp-3" title={formatTaskTitle(task)}>{formatTaskTitle(task)}</p>

                  <div className="text-xs text-primary/60 mb-2">
                    {task.toAgentId && <div>To: {task.toAgentId}</div>}
                  </div>

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
                    {/* Running Duration for Active Tasks */}
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

