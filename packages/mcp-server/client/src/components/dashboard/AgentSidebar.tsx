import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { TextKey } from '@/contexts/ThemeContext';
import { Agent } from '@/types';
import { AgentItem } from './AgentItem';

interface AgentSidebarProps {
  agents: Agent[];
  getRelativeTime: (timestamp: number | undefined) => string;
  // getStatusBadgeClass removed as it's not used in AgentItem (it has its own logic or helper)
  // But wait, AgentSidebar props might be passed from Dashboard which passes getStatusBadgeClass.
  // I should keep it in props to avoid breaking Dashboard call, but mark unused.
  getStatusBadgeClass: (status: string) => string;
  onEvictAgent: (e: React.MouseEvent, id: string) => void;
  t: (key: TextKey) => string;
}

export function AgentSidebar({
  agents,
  getRelativeTime,
  onEvictAgent,
  t
}: AgentSidebarProps) {
  // Sidebar state
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);
  const [pinnedAgents, setPinnedAgents] = useState<Set<string>>(new Set());
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);

  const toggleAgentPin = useCallback((agentId: string) => {
    setPinnedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  return (
    <div
      className={`border-l-2 border-primary bg-card flex flex-col h-full transition-all duration-300 ${(isSidebarExpanded || isSidebarPinned) ? 'w-80' : 'w-14'}`}
      onMouseEnter={() => setIsSidebarExpanded(true)}
      onMouseLeave={() => { if (!isSidebarPinned) setIsSidebarExpanded(false); }}
    >
      {/* Header / Toggle */}
      <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-primary/30 bg-primary/10">
        {(isSidebarExpanded || isSidebarPinned) && (
          <h2 className="text-sm font-black tracking-widest text-primary flex items-center gap-2">
            {t('AGENTS_TITLE')}
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-sm">
              {agents.length}
            </span>
          </h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 ml-auto"
          onClick={() => setIsSidebarPinned(!isSidebarPinned)}
        >
          {isSidebarPinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </Button>
      </div>

      {/* Agents List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {agents.map(agent => (
          <AgentItem
            key={agent.id}
            agent={agent}
            isExpanded={isSidebarExpanded || hoveredAgent === agent.id || isSidebarPinned || pinnedAgents.has(agent.id)}
            isPinned={pinnedAgents.has(agent.id)}
            togglePin={toggleAgentPin}
            onEvict={onEvictAgent}
            getRelativeTime={getRelativeTime}
            onMouseEnter={() => setHoveredAgent(agent.id)}
            onMouseLeave={() => setHoveredAgent(null)}
          />
        ))}
        {agents.length === 0 && (isSidebarExpanded || isSidebarPinned) && (
          <div className="p-4 text-center text-xs text-primary/50 italic">
            No agents connected
          </div>
        )}
      </div>
    </div>
  );
}