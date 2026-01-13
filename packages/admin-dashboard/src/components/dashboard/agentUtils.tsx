import React from 'react';
import { Terminal, Monitor } from 'lucide-react';
import type { Agent } from './AgentIndicator';

/**
 * Get indicator color based on agent status
 * Extracted from AgentSidebar.tsx to reduce complexity
 */
export function getIndicatorColor(agent: Agent): string {
  if (agent.status === 'OFFLINE') return 'border-gray-600 bg-gray-600/10 opacity-50';
  if (agent.status === 'PROCESSING') return 'border-cyan-400 bg-cyan-400/20 animate-working-pulse shadow-[0_0_12px_rgba(34,211,238,0.4)]';
  if (agent.status === 'WAITING') return 'border-green-500 bg-green-500/30';
  const lastSeenMs = agent.lastSeen ? Date.now() - agent.lastSeen : Infinity;
  if (lastSeenMs > 300000) return 'border-red-500 bg-red-500/20';
  if (lastSeenMs > 60000) return 'border-yellow-500 bg-yellow-500/20';
  return 'border-green-500 bg-green-500/30';
}

/**
 * Get initials from agent name
 */
export function getInitials(agent: Agent): string {
  const name = agent.displayName || agent.id;
  const words = name.split(/[\s-_]+/);
  return words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

/**
 * Get source badge for CLI/IDE
 */
export function getSourceBadge(source?: 'cli' | 'ide'): React.ReactNode {
  if (source === 'cli') {
    return <span className="inline-flex items-center gap-0.5 text-compact bg-blue-500/20 text-blue-400 px-1.5 py-0.5 border border-blue-500/30 font-bold"><Terminal className="h-2.5 w-2.5" />CLI</span>;
  }
  if (source === 'ide') {
    return <span className="inline-flex items-center gap-0.5 text-compact bg-purple-500/20 text-purple-400 px-1.5 py-0.5 border border-purple-500/30 font-bold"><Monitor className="h-2.5 w-2.5" />IDE</span>;
  }
  return null;
}
