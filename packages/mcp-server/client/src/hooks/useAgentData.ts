import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSocket, connectSocket, ServerToClientEvents } from '../lib/socket';
import { apiFetch } from '../lib/api';

/**
 * Agent interface matching the Dashboard's Agent type
 */
export interface Agent {
  id: string;
  role: string;
  displayName: string;
  status: 'OFFLINE' | 'WAITING' | 'PROCESSING';
  lastSeen?: number;
  currentTasks?: string[];
  capabilities?: string[];
  createdAt?: number;
  source?: 'cli' | 'ide';
  color?: string;
}

/**
 * Agent status indicator colors
 */
export type AgentStatusColor = 'green' | 'yellow' | 'red' | 'gray';

/**
 * Custom hook for agent data fetching using WebSocket for real-time updates.
 * Falls back to initial fetch if WebSocket unavailable.
 * 
 * @returns Agent data and computed state
 */
export function useAgentData() {
  const [agents, setAgents] = useState<Agent[]>([]);

  /**
   * Initial data fetch on mount
   */
  const fetchAgentData = useCallback(async () => {
    try {
      const res = await apiFetch('/admin/agents/status');
      if (res.ok) {
        setAgents(await res.json());
      }
    } catch (e) {
      console.error('Agent fetch error:', e);
    }
  }, []);

  // WebSocket subscription effect
  useEffect(() => {
    const socket = getSocket();
    connectSocket();

    // Initial fetch for data before socket events start
    fetchAgentData();

    // Handle full sync on connect/reconnect
    const handleSync: ServerToClientEvents['sync:full'] = (data) => {
      if (data.agents) {
        setAgents(data.agents);
      }
    };

    // Handle individual agent status updates
    const handleAgentStatus: ServerToClientEvents['agent:status'] = (data) => {
      setAgents(prev => prev.map(agent =>
        agent.id === data.id
          ? { ...agent, status: data.status as Agent['status'], lastSeen: data.lastSeen }
          : agent
      ));
    };

    socket.on('sync:full', handleSync);
    socket.on('agent:status', handleAgentStatus);

    return () => {
      socket.off('sync:full', handleSync);
      socket.off('agent:status', handleAgentStatus);
    };
  }, [fetchAgentData]);

  /**
   * Get the status color for an agent (for indicator bar)
   */
  const getAgentStatusColor = useCallback((agent: Agent): AgentStatusColor => {
    if (agent.status === 'OFFLINE') return 'gray';
    if (agent.status === 'PROCESSING') return 'yellow';
    const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
    return lastSeenMs > 60000 ? 'red' : 'green';
  }, []);

  /**
   * Get initials from agent name for display
   */
  const getAgentInitials = useCallback((agent: Agent): string => {
    const name = agent.displayName || agent.id;
    const words = name.split(/[\s-_]+/);
    return words.length > 1
      ? (words[0][0] + words[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }, []);

  /**
   * Get relative time string from timestamp
   */
  const getRelativeTime = useCallback((timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    if (diff < 1000) return 'Just now';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }, []);

  // Memoized agent count by status
  const agentCounts = useMemo(() => ({
    total: agents.length,
    online: agents.filter(a => a.status !== 'OFFLINE').length,
    processing: agents.filter(a => a.status === 'PROCESSING').length,
    offline: agents.filter(a => a.status === 'OFFLINE').length
  }), [agents]);

  return {
    agents,
    agentCounts,
    getAgentStatusColor,
    getAgentInitials,
    getRelativeTime,
    refetch: fetchAgentData
  };
}
