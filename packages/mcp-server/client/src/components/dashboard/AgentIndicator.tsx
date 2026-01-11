import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Terminal, Monitor } from 'lucide-react';

export interface Agent {
  id: string;
  displayName?: string;
  role: string;
  status: string;
  currentTasks?: string[];
  lastSeen?: number;
  createdAt?: number;
  capabilities?: string[];
  source?: 'cli' | 'ide';
}

interface AgentIndicatorProps {
  agent: Agent;
  getIndicatorColor: (agent: Agent) => string;
  getInitials: (agent: Agent) => string;
  getRelativeTime: (timestamp: number | undefined) => string;
  getStatusBadgeClass: (status: string) => string;
  getSourceBadge: (source?: 'cli' | 'ide') => React.ReactNode;
  onExpand: () => void;
}

export function SourceBadge({ source }: { source?: 'cli' | 'ide' }) {
  if (source === 'cli') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 border border-blue-500/30 font-bold">
        <Terminal className="h-2.5 w-2.5" />CLI
      </span>
    );
  }
  if (source === 'ide') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 border border-purple-500/30 font-bold">
        <Monitor className="h-2.5 w-2.5" />IDE
      </span>
    );
  }
  return null;
}

export function AgentIndicator({
  agent,
  getIndicatorColor,
  getInitials,
  getRelativeTime,
  getStatusBadgeClass,
  getSourceBadge,
  onExpand
}: AgentIndicatorProps) {
  const currentTask = agent.currentTasks && agent.currentTasks.length > 0
    ? agent.currentTasks[agent.currentTasks.length - 1] : null;

  return (
    <div className="relative group">
      <div
        className={`w-10 h-10 border-2 rounded-sm flex items-center justify-center cursor-pointer transition-all hover:scale-110 hover:shadow-[0_0_15px_hsl(var(--glow)/0.5)] ${getIndicatorColor(agent)}`}
        onClick={onExpand}
      >
        <span className="text-xs font-bold text-foreground">{getInitials(agent)}</span>
      </div>
      {/* Tooltip */}
      <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-50">
        <div className="bg-card border-2 border-primary p-3 shadow-lg shadow-primary/20 min-w-[200px] max-w-[280px]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-bold text-sm text-primary truncate">{agent.displayName || agent.id}</span>
            <div className="flex items-center gap-1">
              {getSourceBadge(agent.source)}
              <Badge className={`${getStatusBadgeClass(agent.status)} text-[10px] shrink-0`}>{agent.status}</Badge>
            </div>
          </div>
          <div className="text-xs text-primary/60 font-mono mb-2">[{agent.role}]</div>
          {currentTask && (
            <div className="border-t border-primary/20 pt-2 mt-2">
              <div className="text-[10px] text-primary/50 uppercase mb-1">Current Task:</div>
              <div className="text-xs text-foreground font-mono truncate">{currentTask}</div>
            </div>
          )}
          <div className="text-[10px] text-primary/40 mt-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />{getRelativeTime(agent.lastSeen)}
          </div>
        </div>
        <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-primary"></div>
      </div>
    </div>
  );
}
