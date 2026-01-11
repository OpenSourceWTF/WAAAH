import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { TextKey } from '@/contexts/ThemeContext';
import { type Agent } from '@/hooks/useAgentData';
import { useAgentSidebar } from '@/hooks/useAgentSidebar';
import { AgentCard } from './AgentCard';
import { AgentIndicator } from './AgentIndicator';

interface AgentSidebarProps {
  agents: Agent[];
  getRelativeTime: (timestamp: number | undefined) => string;
  getStatusBadgeClass: (status: string) => string;
  onEvictAgent: (e: React.MouseEvent, id: string) => void;
  t: (key: TextKey) => string;
}

export function AgentSidebar({
  agents,
  getRelativeTime,
  getStatusBadgeClass,
  onEvictAgent,
  t
}: AgentSidebarProps) {
  const {
    isSidebarExpanded, setIsSidebarExpanded,
    isSidebarPinned,
    pinnedAgents, toggleAgentPin,
    hoveredAgent, setHoveredAgent,
    toggleSidebar
  } = useAgentSidebar();

  const isExpandedView = isSidebarExpanded || isSidebarPinned;

  return (
    <div
      className={`border-l-2 border-primary bg-card flex flex-col h-full transition-all duration-300 ${isExpandedView ? 'w-80' : 'w-14'}`}
      onMouseEnter={() => setIsSidebarExpanded(true)}
      onMouseLeave={() => { if (!isSidebarPinned) setIsSidebarExpanded(false); }}
    >
      {/* Header / Toggle */}
      <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-primary/30 bg-primary/10">
        {isExpandedView && (
          <h2 className="text-sm font-black tracking-widest text-primary flex items-center gap-2">
            {t('AGENTS_TITLE')}
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-sm">{agents.length}</span>
          </h2>
        )}
        <button
          onClick={toggleSidebar}
          className={`w-10 h-10 flex items-center justify-center hover:bg-primary/20 transition-colors rounded-sm border-2 ${isSidebarPinned ? 'bg-primary/20 border-primary' : 'border-transparent'} ${!isExpandedView ? 'mx-auto' : 'ml-auto'}`}
          title={isSidebarPinned ? "Unpin sidebar" : "Pin sidebar open"}
        >
          {isExpandedView
            ? <PanelLeftClose className={`h-4 w-4 ${isSidebarPinned ? 'text-foreground' : 'text-primary'}`} />
            : <PanelLeftOpen className="h-4 w-4 text-primary" />}
        </button>
      </div>

      {/* Collapsed View: Agent Indicators */}
      {!isExpandedView && (
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
                onExpand={() => setIsSidebarExpanded(true)}
                getRelativeTime={getRelativeTime}
                getStatusBadgeClass={getStatusBadgeClass}
              />
            ))}
          </div>
        </div>
      )}

      {/* Expanded View: Full Agent Cards */}
      {isExpandedView && (
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
                onHover={setHoveredAgent}
                onTogglePin={toggleAgentPin}
                onEvict={onEvictAgent}
                getRelativeTime={getRelativeTime}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}