import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

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
}

/**
 * Agent status indicator colors
 */
export type AgentStatusColor = 'green' | 'yellow' | 'red' | 'gray';

/**
 * Custom hook for agent data fetching with deduplication to prevent animation interruptions.
 * Uses refs to compare new data with previous, only triggering re-renders on actual changes.
 * 
 * @param pollInterval - Polling interval in milliseconds (default: 2000)
 * @returns Agent data and computed state
 */
export function useAgentData(pollInterval = 2000) {
  const [agents, setAgents] = useState<Agent[]>([]);

  // Ref for previous data comparison
  const prevAgentsRef = useRef<string>('');

  /**
   * Compare and update state only if data actually changed.
   */
  const updateIfChanged = useCallback(<T,>(
    newData: T,
    prevRef: React.MutableRefObject<string>,
    setter: React.Dispatch<React.SetStateAction<T>>
  ) => {
    const newJson = JSON.stringify(newData);
    if (newJson !== prevRef.current) {
      prevRef.current = newJson;
      setter(newData);
    }
  }, []);

  /**
   * Fetch agent status data from the server
   */
  const fetchAgentData = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch('http://localhost:3000/admin/agents/status', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        updateIfChanged(data, prevAgentsRef, setAgents);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Agent fetch error:', e);
    }
  }, [updateIfChanged]);

  // Polling effect
  useEffect(() => {
    fetchAgentData();
    const interval = setInterval(fetchAgentData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAgentData, pollInterval]);

  /**
   * Get the status color for an agent (for indicator bar)
   * - green: active/online (last seen < 60s)
   * - yellow: processing (working on task)
   * - red: stale (last seen > 60s)
   * - gray: offline/evicted
   */
  const getAgentStatusColor = useCallback((agent: Agent): AgentStatusColor => {
    if (agent.status === 'OFFLINE') return 'gray';
    if (agent.status === 'PROCESSING') return 'yellow';
    // WAITING = active/online
    const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
    if (lastSeenMs > 60000) return 'red'; // Stale > 60s
    return 'green'; // Active
  }, []);

  /**
   * Get initials from agent name for display
   */
  const getAgentInitials = useCallback((agent: Agent): string => {
    const name = agent.displayName || agent.id;
    const words = name.split(/[\s-_]+/);
    if (words.length > 1) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
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
