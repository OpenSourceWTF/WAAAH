import { useState, useCallback } from 'react';
import { PanelLeftClose, PanelLeftOpen, Terminal, Monitor } from 'lucide-react';
import type { TextKey } from '@/contexts/ThemeContext';
import { AgentCard } from './AgentCard';
import { AgentIndicator, type Agent } from './AgentIndicator';

interface AgentSidebarProps {
  agents: Agent[];
  getRelativeTime: (timestamp: number | undefined) => string;
  getStatusBadgeClass: (status: string) => string;
  onEvictAgent: (e: React.MouseEvent, id: string) => void;
  t: (key: TextKey) => string;
}

export function AgentSidebar({ agents, getRelativeTime, getStatusBadgeClass, onEvictAgent, t }: AgentSidebarProps) {
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [pinnedAgents, setPinnedAgents] = useState<Set<string>>(new Set());
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const toggleAgentPin = useCallback((agentId: string) => {
    setPinnedAgents(prev => {
      const next = new Set(prev);
      next.has(agentId) ? next.delete(agentId) : next.add(agentId);
      return next;
    });
  }, []);

  const getIndicatorColor = useCallback((agent: Agent) => {
    if (agent.status === 'OFFLINE') return 'border-gray-600 bg-gray-600/10 opacity-50';
    if (agent.status === 'PROCESSING') return 'border-cyan-400 bg-cyan-400/20 animate-working-pulse shadow-[0_0_12px_rgba(34,211,238,0.4)]';
    if (agent.status === 'WAITING') return 'border-green-500 bg-green-500/30';
    const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
    if (lastSeenMs > 300000) return 'border-red-500 bg-red-500/20';
    if (lastSeenMs > 60000) return 'border-yellow-500 bg-yellow-500/20';
    return 'border-green-500 bg-green-500/30';
  }, []);

  const getInitials = useCallback((agent: Agent) => {
    const name = agent.displayName || agent.id;
    const words = name.split(/[\s-_]+/);
    return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }, []);

  const getSourceBadge = useCallback((source?: 'cli' | 'ide') => {
    if (source === 'cli') {
      return <span className="inline-flex items-center gap-0.5 text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 border border-blue-500/30 font-bold"><Terminal className="h-2.5 w-2.5" />CLI</span>;
    }
    if (source === 'ide') {
      return <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 border border-purple-500/30 font-bold"><Monitor className="h-2.5 w-2.5" />IDE</span>;
    }
    return null;
  }, []);

  const isExpanded = isSidebarExpanded || isSidebarPinned;

  return (
    <div
      className={`border-l-2 border-primary bg-card flex flex-col h-full transition-all duration-300 ${isExpanded ? 'w-80' : 'w-14'}`}
      onMouseEnter={() => setIsSidebarExpanded(true)}
      onMouseLeave={() => { if (!isSidebarPinned) setIsSidebarExpanded(false); }}
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-primary/30 bg-primary/10">
        {isExpanded && (
          <h2 className="text-sm font-black tracking-widest text-primary flex items-center gap-2">
            {t('AGENTS_TITLE')}
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-sm">{agents.length}</span>
          </h2>
        )}
        <button
          onClick={() => {
            if (isSidebarPinned) { setIsSidebarPinned(false); setIsSidebarExpanded(false); }
            else { setIsSidebarPinned(true); setIsSidebarExpanded(true); }
          }}
          className={`w-10 h-10 flex items-center justify-center hover:bg-primary/20 transition-colors rounded-sm border-2 ${isSidebarPinned ? 'bg-primary/20 border-primary' : 'border-transparent'} ${!isExpanded ? 'mx-auto' : 'ml-auto'}`}
          title={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
        >
          {isExpanded ? <PanelLeftClose className={`h-4 w-4 ${isSidebarPinned ? 'text-foreground' : 'text-primary'}`} /> : <PanelLeftOpen className="h-4 w-4 text-primary" />}
        </button>
      </div>

      {/* Collapsed View: Indicators */}
      {!isExpanded && (
        <div className="flex-1 overflow-hidden py-2 px-2 scrollbar-none">
          <div className="flex flex-col items-center gap-2">
            {agents.length === 0 && (
              <div className="w-10 h-10 border-2 border-dashed border-primary/30 rounded-sm flex items-center justify-center">
                <span className="text-primary/30 text-xs">?</span>
              </div>
            )}
            {agents.map(agent => (
              <AgentIndicator
                key={agent.id}
                agent={agent}
                getIndicatorColor={getIndicatorColor}
                getInitials={getInitials}
                getRelativeTime={getRelativeTime}
                getStatusBadgeClass={getStatusBadgeClass}
                getSourceBadge={getSourceBadge}
                onExpand={() => setIsSidebarExpanded(true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Expanded View: Cards */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto scrollbar-none p-3">
          <div className="space-y-2">
            {agents.length === 0 && (
              <div className="w-full p-3 border-2 border-dashed border-primary/30 rounded-sm flex items-center justify-center">
                <span className="text-primary/30 text-sm">NO AGENTS</span>
              </div>
            )}
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                isExpanded={pinnedAgents.has(agent.id) || hoveredAgent === agent.id}
                isPinned={pinnedAgents.has(agent.id)}
                getRelativeTime={getRelativeTime}
                getInitials={getInitials}
                getSourceBadge={getSourceBadge}
                onTogglePin={() => toggleAgentPin(agent.id)}
                onEvict={(e) => onEvictAgent(e, agent.id)}
                onMouseEnter={() => setHoveredAgent(agent.id)}
                onMouseLeave={() => setHoveredAgent(null)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
