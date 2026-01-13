import React from 'react';
import { Terminal, Monitor } from 'lucide-react';
import type { Agent } from './AgentCard';
import { getAgentIndicatorClass } from '@/lib/agentStatus';

/**
 * Get indicator color based on agent status.
 * Uses centralized status styling - no more lastSeen-based degradation.
 */
export function getIndicatorColor(agent: Agent): string {
  return getAgentIndicatorClass(agent.status);
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
