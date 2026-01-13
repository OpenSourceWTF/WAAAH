import React from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";
import type { Task } from './types';
import { getStatusBadgeClass, getTaskDuration, formatTaskTitle, formatDate, formatStatusLabel } from './utils';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({ task, onClick }) => {
  const unreadCount = task.messages?.filter(m => m.role === 'user' && m.isRead === false).length ?? 0;
  const progressUpdates = task.messages?.filter(m => m.role === 'agent' && m.metadata && (m.metadata as Record<string, unknown>).percentage !== undefined) ?? [];
  const latestProgress = progressUpdates.length > 0 ? progressUpdates[progressUpdates.length - 1] : null;
  const percentage = latestProgress ? ((latestProgress.metadata as Record<string, unknown>)?.percentage as number) || 0 : 0;
  const isTerminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status);

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-all duration-200 bg-card/80 hover:bg-card border-2 border-primary/20 hover:shadow-lg hover:shadow-primary/10 rounded-none"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-2 space-y-1">
        {/* Row 1: Status + BLOCKED/NEW badge + Source badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Badge className={getStatusBadgeClass(task.status)}>{formatStatusLabel(task.status)}</Badge>
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
});

TaskCard.displayName = 'TaskCard';
