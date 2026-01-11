/**
 * Heartbeat Middleware
 * 
 * Centralized heartbeat handling for MCP tool calls.
 * Debounces updates to max once per 10 seconds per agent.
 */

const HEARTBEAT_DEBOUNCE_MS = 10 * 1000; // 10 seconds

// Track last heartbeat time per agent
const lastHeartbeatMap = new Map<string, number>();

export interface HeartbeatDeps {
  heartbeat: (agentId: string) => void;
}

/**
 * Check if heartbeat should be sent (debounce check)
 */
export function shouldSendHeartbeat(agentId: string): boolean {
  const lastTime = lastHeartbeatMap.get(agentId);
  const now = Date.now();

  if (!lastTime || (now - lastTime) >= HEARTBEAT_DEBOUNCE_MS) {
    return true;
  }
  return false;
}

/**
 * Send heartbeat if debounce period has passed
 * Returns true if heartbeat was sent, false if debounced
 */
export function sendHeartbeatIfNeeded(agentId: string, deps: HeartbeatDeps): boolean {
  if (!shouldSendHeartbeat(agentId)) {
    return false;
  }

  deps.heartbeat(agentId);
  lastHeartbeatMap.set(agentId, Date.now());
  return true;
}

/**
 * Extract agentId from tool call params
 * Different tools use different parameter names
 */
export function extractAgentId(toolName: string, params: Record<string, unknown>): string | undefined {
  // Most tools use 'agentId' directly
  if (typeof params.agentId === 'string') {
    return params.agentId;
  }

  // Some tools use 'sourceAgentId' for the caller
  if (typeof params.sourceAgentId === 'string') {
    return params.sourceAgentId;
  }

  return undefined;
}

/**
 * Process heartbeat for a tool call
 * This should be called at the start of every tool handler
 */
export function processHeartbeat(
  toolName: string,
  params: Record<string, unknown>,
  deps: HeartbeatDeps
): void {
  const agentId = extractAgentId(toolName, params);
  if (agentId) {
    sendHeartbeatIfNeeded(agentId, deps);
  }
}

// For testing: clear the debounce map
export function clearHeartbeatCache(): void {
  lastHeartbeatMap.clear();
}

// For testing: get cache state
export function getHeartbeatCache(): Map<string, number> {
  return new Map(lastHeartbeatMap);
}
