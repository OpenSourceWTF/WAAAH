
import { Agent } from '@/types';
import { Pin, ChevronUp, ChevronDown, Clock, Cpu, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SourceBadge } from './SourceBadge';
import { getIndicatorColor, getInitials } from '@/lib/agent-utils';

interface AgentItemProps {
  agent: Agent;
  isExpanded: boolean;
  isPinned: boolean;
  togglePin: (id: string) => void;
  onEvict: (e: React.MouseEvent, id: string) => void;
  getRelativeTime: (ts: number | undefined) => string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function AgentItem({
  agent,
  isExpanded,
  isPinned,
  togglePin,
  onEvict,
  getRelativeTime,
  onMouseEnter,
  onMouseLeave
}: AgentItemProps) {
  return (
    <div
      className={`group relative border-b border-primary/20 hover:bg-primary/5 transition-all duration-200 ${isExpanded ? 'bg-primary/5' : ''}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Main Row */}
      <div
        className="flex items-stretch min-h-[3rem] cursor-pointer"
        onClick={() => togglePin(agent.id)}
      >
        {/* Status stripe */}
        <div className={`w-1 shrink-0 ${getIndicatorColor(agent).split(' ')[1]}`} />

        {/* Card content */}
        <div className="flex-1 p-2 min-w-0">
          {/* Row 1: Initials + Name + Chevron */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary/70 shrink-0">{getInitials(agent)}</span>
            <span className="font-bold text-sm text-primary truncate flex-1">
              {agent.displayName || agent.id}
            </span>
            {isPinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
            {isExpanded
              ? <ChevronUp className="h-4 w-4 text-primary shrink-0" />
              : <ChevronDown className="h-4 w-4 text-primary/50 shrink-0" />}
          </div>

          {/* Row 2: Role + Source + Status + Time */}
          <div className="flex items-center gap-2 mt-1 text-[10px]">
            {agent.role && <span className="text-primary/50 font-mono">[{agent.role}]</span>}
            <SourceBadge source={agent.source} />
            <span className={`font-bold ${agent.status === 'PROCESSING' ? 'text-cyan-400' :
                agent.status === 'WAITING' ? 'text-green-500' :
                  agent.status === 'OFFLINE' ? 'text-gray-500' : 'text-yellow-500'
              }`}>{agent.status}</span>
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
                  <span key={cap} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/20">
                    {cap}
                  </span>
                ))}
                {agent.capabilities.length > 5 && (
                  <span className="text-[9px] text-primary/50">+{agent.capabilities.length - 5} more</span>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-primary/30 italic">None declared</span>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end pt-2 border-t border-primary/10">
            <Button
              variant="destructive"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={(e) => onEvict(e, agent.id)}
            >
              <Power className="h-3 w-3 mr-1" /> SHUTDOWN
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
