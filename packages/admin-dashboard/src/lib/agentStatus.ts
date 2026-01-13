/**
 * Agent Status Display
 * 
 * Single source of truth for agent status colors and styling.
 * Status is determined by the backend based on:
 * - PROCESSING: Agent has assigned tasks
 * - WAITING: Agent is actively waiting for tasks
 * - OFFLINE: Agent is not connected
 */

export type AgentStatus = 'PROCESSING' | 'WAITING' | 'OFFLINE';

export interface AgentDisplayStyle {
  textColor: string;
  bgColor: string;
  borderColor: string;
  stripeColor: string;
  animation?: string;
  opacity?: string;
}

/**
 * Get the display style for an agent based on their status.
 * This is the ONLY place agent status colors should be defined.
 */
export function getAgentDisplayStyle(status: string): AgentDisplayStyle {
  switch (status) {
    case 'PROCESSING':
      return {
        textColor: 'text-cyan-400',
        bgColor: 'bg-cyan-400/20',
        borderColor: 'border-cyan-400',
        stripeColor: 'bg-cyan-400',
        animation: 'animate-pulse'
      };
    case 'WAITING':
      return {
        textColor: 'text-green-500',
        bgColor: 'bg-green-500/30',
        borderColor: 'border-green-500',
        stripeColor: 'bg-green-500'
      };
    case 'OFFLINE':
    default:
      return {
        textColor: 'text-gray-500',
        bgColor: 'bg-gray-600/10',
        borderColor: 'border-gray-600',
        stripeColor: 'bg-gray-600',
        opacity: 'opacity-50'
      };
  }
}

/**
 * Get a combined class string for the agent indicator (card border/background)
 */
export function getAgentIndicatorClass(status: string): string {
  const style = getAgentDisplayStyle(status);
  const base = `border-2 ${style.borderColor} ${style.bgColor}`;
  const anim = style.animation || '';
  const opac = style.opacity || '';
  return `${base} ${anim} ${opac}`.trim();
}
