
import { Agent } from '../types';

export const getIndicatorColor = (agent: Agent) => {
  if (agent.status === 'OFFLINE') return 'border-gray-600 bg-gray-600/10 opacity-50';
  if (agent.status === 'PROCESSING') return 'border-cyan-400 bg-cyan-400/20 animate-working-pulse shadow-[0_0_12px_rgba(34,211,238,0.4)]';
  // WAITING agents are healthy - they're just polling for tasks
  if (agent.status === 'WAITING') return 'border-green-500 bg-green-500/30';
  const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
  // Only show red if truly stale (>5 min without heartbeat)
  if (lastSeenMs > 300000) return 'border-red-500 bg-red-500/20';
  // Yellow warning if between 1-5 min
  if (lastSeenMs > 60000) return 'border-yellow-500 bg-yellow-500/20';
  return 'border-green-500 bg-green-500/30';
};

export const getInitials = (agent: Agent) => {
  const name = agent.displayName || agent.id;
  const words = name.split(/[\s-_]+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};
