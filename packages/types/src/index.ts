export * from './schemas.js';
export * from './mcp-tools.js';
export * from './errors.js';

import { StandardCapability, TaskStatus, AgentConnectionStatus } from './schemas.js';

// ===== Entity Interfaces =====

/**
 * Interface representing the identity and capabilities of an agent.
 */
export interface AgentIdentity {
  /** Unique ID of the agent (e.g. "fullstack-1") */
  id: string;
  /** Capabilities this agent has */
  capabilities: StandardCapability[];
  state?: string;      // Current state summary (for resumption)
  displayName?: string;
  role?: string;
  status?: 'idle' | 'busy' | 'offline'; // made optional as it's computed
  lastSeen?: number; // timestamp
  color?: string; // For UI visualization
  currentTask?: string;
  /** Workspace context for affinity matching */
  workspaceContext?: {
    type: 'local' | 'github';
    repoId: string;
    branch?: string;
    path?: string;
  };
}

/**
 * Message in a task thread
 */
export interface TaskMessage {
  id: string;
  taskId: string;
  role: 'user' | 'agent' | 'system';  // This is message role, not agent role
  content: string;
  timestamp: number;
  isRead?: boolean;  // For mailbox: user comments start unread
  messageType?: 'comment' | 'review_feedback' | 'progress' | 'block_event'; // Distinguishes comment types
  replyTo?: string;  // For threading: references parent message ID
  metadata?: Record<string, unknown>;
}

/**
 * Interface representing a task within the system.
 */
export interface Task {
  id: string;
  status: TaskStatus;
  prompt: string;
  title?: string; // Auto-generated descriptive title from first line of prompt
  priority: 'high' | 'normal' | 'critical';
  from: {
    type: 'user' | 'agent' | 'system';
    id: string;
    name?: string;
  };
  command?: string; // Optional command name (e.g. 'execute_prompt')
  to: {
    agentId?: string;  // HINT: Preferred agent (adds score, not required)
    requiredCapabilities?: StandardCapability[];  // Capabilities required
    workspaceId?: string;  // Repository ID for workspace affinity
  };
  context?: Record<string, unknown>;
  createdAt: number;
  completedAt?: number;
  assignedTo?: string; // agentId who picked it up
  response?: any; // The result payload
  threadId?: string;
  messages?: TaskMessage[];
  dependencies?: string[];
  history?: TaskHistoryEvent[];
}

export interface TaskHistoryEvent {
  timestamp: number;
  status: TaskStatus;
  agentId?: string;
  message?: string;
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
  'admin_evict_agent',
  'block_task',
  'answer_task',
  'get_task_context'
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

/**
 * Generic system prompt sent to agents via wait_for_prompt.
 * Used for workflow updates, system messages, configuration changes, etc.
 */
export interface SystemPrompt {
  controlSignal: 'SYSTEM_PROMPT';
  promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE';
  message: string;
  payload?: Record<string, unknown>;
  priority?: 'normal' | 'high' | 'critical';
}
