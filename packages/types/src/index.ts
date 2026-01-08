export * from './schemas.js';
export * from './mcp-tools.js';
export * from './errors.js';

import { AgentRole, TaskStatus, AgentConnectionStatus } from './schemas.js';

// ===== Entity Interfaces =====

/**
 * Interface representing the identity and capabilities of an agent.
 */
export interface AgentIdentity {
  /** Unique ID of the agent (e.g. "fullstack-1") */
  id: string;
  role: AgentRole;
  displayName?: string;
  capabilities: string[];
  status?: 'idle' | 'busy' | 'offline'; // made optional as it's computed
  lastSeen?: number; // timestamp
  color?: string; // For UI visualization
  currentTask?: string;
}

/**
 * Interface representing a task within the system.
 */
export interface Task {
  id: string;
  status: TaskStatus;
  prompt: string;
  priority: 'high' | 'normal' | 'critical';
  from: {
    type: 'user' | 'agent' | 'system';
    id: string;
    name?: string;
  };
  command?: string; // Optional command name (e.g. 'execute_prompt')
  to: {
    agentId?: string;
    role?: AgentRole;
  };
  context?: Record<string, unknown>;
  createdAt: number;
  completedAt?: number;
  assignedTo?: string; // agentId who picked it up
  response?: any; // The result payload
  threadId?: string;
}

/**
 * Interface representing a task response.
 */
export interface TaskResponse {
  taskId: string;
  status: TaskStatus;
  message: string;
  artifacts?: string[];
  blockedReason?: string;
  completedAt: number;
}

/**
 * Interface representing detailed agent status.
 */
export interface AgentStatus {
  agentId: string;
  status: AgentConnectionStatus;
  lastSeen: number;
  currentTask?: string;
}

/**
 * Interface representing a server-sent event (SSE) payload.
 */
export interface SSEEvent {
  type: string;
  data: unknown;
}

// ===== Tool Names =====
export const TOOL_NAMES = [
  'register_agent',
  'wait_for_prompt',
  'wait_for_task',
  'send_response',
  'assign_task',
  'list_agents',
  'get_agent_status',
  'ack_task',
  'admin_update_agent',
  'admin_evict_agent'
] as const;
export type ToolName = typeof TOOL_NAMES[number];

/**
 * Payload sent to an agent to signal eviction.
 */
export interface EvictionSignal {
  controlSignal: 'EVICT';
  reason: string;
  action: 'RESTART' | 'SHUTDOWN';
}
