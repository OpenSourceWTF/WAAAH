/**
 * CLI formatting utilities - Shared display formatting
 */

export interface AgentInfo {
  id?: string;
  agentId?: string;
  displayName?: string;
  role?: string;
  status?: string;
  currentTasks?: string[];
}

/** Standard MCP tool response wrapper */
export interface MCPToolResponse<T> {
  content?: Array<{ text?: string }>;
  _parsed?: T;
}

/**
 * Get status icon for agent connection status
 */
export function getStatusIcon(status: string): string {
  switch (status) {
    case 'WAITING': return '🟢';
    case 'PROCESSING': return '🔵';
    default: return '⚪';
  }
}

/**
 * Format a single agent for display (list view)
 */
export function formatAgentListItem(agent: AgentInfo): string {
  const id = agent.id || agent.agentId || 'unknown';
  return `  - ${agent.displayName || id} (${id}) [${agent.role || 'unknown'}]`;
}

/**
 * Format an agent with status for display
 */
export function formatAgentStatus(agent: AgentInfo): string {
  const icon = getStatusIcon(agent.status || '');
  const id = agent.id || agent.agentId || 'unknown';
  const name = agent.displayName || id;
  const tasks = agent.currentTasks?.length ? ` (${agent.currentTasks.length} task(s))` : '';
  return `${icon} ${name} (${id}) [${agent.role || 'unknown'}]: ${agent.status || 'UNKNOWN'}${tasks}`;
}

/**
 * Format single agent status with tasks
 */
export function formatSingleAgentStatus(agent: AgentInfo): string {
  const icon = getStatusIcon(agent.status || '');
  const id = agent.agentId || agent.id || 'unknown';
  const name = agent.displayName || id;
  let output = `${icon} ${name} [${agent.role || 'unknown'}]: ${agent.status || 'UNKNOWN'}`;
  if (agent.currentTasks?.length) {
    output += `\n   Tasks: ${agent.currentTasks.join(', ')}`;
  }
  return output;
}
