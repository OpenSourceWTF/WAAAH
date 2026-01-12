import React from 'react';
import { Button } from '@/components/ui/button';
import { Clock, Pin, Cpu, Power, ChevronDown, ChevronUp } from 'lucide-react';

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
  workspaceContext?: {
    root?: string;
    workspaceId?: string;
    path?: string;
    repoId?: string;
  };
}

interface AgentCardProps {
  agent: Agent;
  isExpanded: boolean;
  isPinned: boolean;
  getRelativeTime: (timestamp: number | undefined) => string;
  getInitials: (agent: Agent) => string;
  getSourceBadge: (source?: 'cli' | 'ide') => React.ReactNode;
  onTogglePin: () => void;
  onEvict: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function AgentCard({
  agent,
  isExpanded,
  isPinned,
  getRelativeTime,
  getInitials,
  getSourceBadge,
  onTogglePin,
  onEvict,
  onMouseEnter,
  onMouseLeave
}: AgentCardProps) {
  const currentTask = agent.currentTasks && agent.currentTasks.length > 0
    ? agent.currentTasks[agent.currentTasks.length - 1] : null;

  const statusColorClass = agent.status === 'PROCESSING' ? 'text-cyan-400' :
    agent.status === 'WAITING' ? 'text-green-500' :
      agent.status === 'OFFLINE' ? 'text-gray-500' : 'text-yellow-500';

  const stripeClass = agent.status === 'PROCESSING' ? 'bg-cyan-400 animate-pulse' :
    agent.status === 'WAITING' ? 'bg-green-500' :
      agent.status === 'OFFLINE' ? 'bg-gray-600' : 'bg-yellow-500';

  return (
    <div
      className={`border-2 transition-all duration-200 cursor-pointer ${isExpanded ? 'border-primary bg-primary/5' : 'border-primary/30 bg-card hover:border-primary/60'}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onTogglePin}
    >
      {/* Card with left status stripe */}
      <div className="flex">
        <div className={`w-1 shrink-0 ${stripeClass}`} />
        <div className="flex-1 p-2 min-w-0">
          {/* Row 1: Initials + Name + Chevron */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary/70 shrink-0">{getInitials(agent)}</span>
            <span className="font-bold text-sm text-primary truncate flex-1">{agent.displayName || agent.id}</span>
            {isPinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
            {isExpanded ? <ChevronUp className="h-4 w-4 text-primary shrink-0" /> : <ChevronDown className="h-4 w-4 text-primary/50 shrink-0" />}
          </div>

          {/* Row 2: Role + Source + Status + Time */}
          <div className="flex items-center gap-2 mt-1 text-[10px]">
            {agent.role && <span className="text-primary/50 font-mono">[{agent.role}]</span>}
            {getSourceBadge(agent.source)}
            <span className={`font-bold ${statusColorClass}`}>{agent.status}</span>
            <span className="text-primary/40 ml-auto">{getRelativeTime(agent.lastSeen)}</span>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="px-2 pb-2 pt-1 border-t border-primary/20 bg-primary/5 space-y-2">
          {/* Time Info */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-primary/70">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Created: {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString() : 'Unknown'}</span>
            </div>
            <div className="flex items-center gap-1">
              <span>Seen: {getRelativeTime(agent.lastSeen)}</span>
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <div className="flex items-center gap-1 text-[10px] text-primary/50 mb-1">
              <Cpu className="h-3 w-3" /><span>CAPABILITIES:</span>
            </div>
            {agent.capabilities && agent.capabilities.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {agent.capabilities.slice(0, 5).map(cap => (
                  <span key={cap} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/20">{cap}</span>
                ))}
                {agent.capabilities.length > 5 && <span className="text-[9px] text-primary/50">+{agent.capabilities.length - 5} more</span>}
              </div>
            ) : (
              <span className="text-[10px] text-primary/40 italic">None listed</span>
            )}
          </div>

          {/* Workspace */}
          {agent.workspaceContext && (agent.workspaceContext.repoId || agent.workspaceContext.workspaceId || agent.workspaceContext.root || agent.workspaceContext.path) && (
            <div>
              <div className="text-[10px] text-primary/50 uppercase mb-1">Workspace:</div>
              <div className="text-[9px] font-mono text-primary/70 bg-black/20 px-1.5 py-1 border border-primary/20 truncate">
                {agent.workspaceContext.repoId || agent.workspaceContext.workspaceId || agent.workspaceContext.root || agent.workspaceContext.path}
              </div>
            </div>
          )}

          {/* Current Task */}
          {currentTask && (
            <div>
              <div className="text-[10px] text-primary/50 uppercase mb-1">Current Task:</div>
              <div className="text-xs text-foreground font-mono bg-black/20 p-2 border border-primary/20 truncate">{currentTask}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end pt-2 border-t border-primary/20">
            <Button
              variant="destructive"
              size="sm"
              className="h-6 gap-1 text-[10px] font-mono uppercase bg-red-600 hover:bg-red-700"
              onClick={onEvict}
            >
              <Power className="h-3 w-3" /> Kill
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
