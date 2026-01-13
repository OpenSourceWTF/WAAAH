import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { Task } from './types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  id: string;
  label: string;
  tasks: Task[];
  onCardClick: (task: Task) => void;
  // Infinite scroll props (optional, only for DONE/CANCELLED)
  hasMore?: boolean;
  loadingMore?: boolean;
  sentinelRef?: React.RefObject<HTMLDivElement | null>;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = React.memo(({
  id,
  label,
  tasks,
  onCardClick,
  hasMore,
  loadingMore,
  sentinelRef
}) => {
  return (
    <div className="flex-1 min-w-[180px] flex flex-col border-2 border-primary/30">
      {/* Column Header - lighter */}
      <div className="flex items-center justify-between p-3 pb-2 border-b-2 border-primary/30 bg-card/80">
        <h3 className="font-bold text-sm text-primary">{label}</h3>
        <Badge variant="outline" className="text-xs border-primary/50">{tasks.length}</Badge>
      </div>
      {/* Column Body - darker */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2 bg-black/30">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onCardClick(task)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center text-primary/30 text-xs py-8 italic">No tasks</div>
        )}
        {/* Infinite scroll sentinel */}
        {hasMore && sentinelRef && (
          <div ref={sentinelRef} className="w-full py-2 text-center text-xs text-primary/40">
            {loadingMore ? (
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
  );
});

KanbanColumn.displayName = 'KanbanColumn';
