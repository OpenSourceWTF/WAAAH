import React from 'react';
import { Badge } from "@/components/ui/badge";
import type { Task } from './types';
import { getStatusBadgeClass } from './utils';

interface TimelineTabProps {
  task: Task;
}

type TimelineItem =
  | { type: 'progress'; data: NonNullable<Task['messages']>[0]; timestamp: number }
  | { type: 'status'; data: NonNullable<Task['history']>[0]; timestamp: number };

export const TimelineTab: React.FC<TimelineTabProps> = ({ task }) => {
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

  return (
    <div className="space-y-2 max-h-full overflow-y-auto">
      {items.map((item, idx) => {
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
      })}
    </div>
  );
};
