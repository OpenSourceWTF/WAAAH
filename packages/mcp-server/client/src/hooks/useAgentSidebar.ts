import { useState, useCallback } from 'react';

export function useAgentSidebar() {
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

  const toggleSidebar = useCallback(() => {
    if (isSidebarPinned) {
      setIsSidebarPinned(false);
      setIsSidebarExpanded(false);
    } else {
      setIsSidebarPinned(true);
      setIsSidebarExpanded(true);
    }
  }, [isSidebarPinned]);

  return {
    isSidebarExpanded, setIsSidebarExpanded,
    isSidebarPinned, setIsSidebarPinned,
    pinnedAgents, toggleAgentPin,
    hoveredAgent, setHoveredAgent,
    toggleSidebar
  };
}
