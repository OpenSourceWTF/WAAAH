import { z } from 'zod';

// ===== Core Types =====

/**
 * Valid roles for agents within the WAAAH system.
 * These roles determine the capabilities and responsibilities of an agent.
 */
export const AgentRole = z.enum([
  'boss',
  'project-manager',
  'full-stack-engineer',
  'test-engineer',
  'ops-engineer',
  'designer',
  'developer',
  'code-monk'
]);
export type AgentRole = z.infer<typeof AgentRole>;

/**
 * Valid statuses for a task.
 * Tracks the lifecycle of a task from creation to completion or failure.
 */
export const TaskStatus = z.enum([
  'QUEUED',
  'PENDING_ACK',
  'ASSIGNED',
  'PENDING', // Deprecated?
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'CANCELLED'
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/**
 * Connection status of an agent.
 */
export type AgentConnectionStatus = 'OFFLINE' | 'WAITING' | 'PROCESSING';

// ===== Constants =====

/**
 * Default internal prompt timeout in seconds.
 * Can be overridden by WAAAH_PROMPT_TIMEOUT env var.
 */
export const DEFAULT_PROMPT_TIMEOUT = 290; // Default to 290s (just under 300s limit)

/**
 * Maximum allowed prompt timeout in seconds.
 * Hard limit to prevent excessive blocking.
 */
export const MAX_PROMPT_TIMEOUT = 300;

// ===== Helper Factories =====

/**
 * Factory function to create a Zod schema for wait_for_prompt arguments.
 * Allows injecting a configurable default timeout.
 * 
 * @param defaultTimeout - The default timeout in seconds to use if not provided in args.
 * @param maxTimeout - The maximum allowed timeout in seconds to enforce.
 * @returns A Zod schema for validating wait_for_prompt arguments.
 */
export const createWaitForPromptSchema = (
  defaultTimeout = DEFAULT_PROMPT_TIMEOUT,
  maxTimeout = MAX_PROMPT_TIMEOUT
) => z.object({
  agentId: z.string().min(1).describe("The ID of the agent waiting for a prompt"),
  timeout: z.number()
    .optional()
    .default(defaultTimeout)
    .describe(`Timeout in seconds (default: ${defaultTimeout})`)
    .transform((val) => {
      // Cap at maxTimeout, ensure at least 1s
      if (val > maxTimeout) return defaultTimeout;
      if (val < 1) return 1;
      return val;
    })
});

// ===== Tool Schemas =====

/**
 * Standard schema for wait_for_prompt tool.
 * Uses the default constants.
 */
export const waitForPromptSchema = createWaitForPromptSchema();
export type WaitForPromptArgs = z.infer<typeof waitForPromptSchema>;

/**
 * Schema for register_agent tool arguments.
 */
export const registerAgentSchema = z.object({
  agentId: z.string().min(1).describe("Unique identifier for the agent"),
  role: AgentRole.describe("The role of the agent"),
  displayName: z.string().optional().describe("Human-readable name for the agent"),
  capabilities: z.array(z.string()).optional().describe("List of capabilities/tools the agent has")
});
export type RegisterAgentArgs = z.infer<typeof registerAgentSchema>;

/**
 * Schema for wait_for_task tool arguments.
 */
export const waitForTaskSchema = z.object({
  taskId: z.string().min(1).describe("The ID of the task to wait for"),
  timeout: z.number().optional().default(300).describe("Timeout in seconds (default: 300)")
});
export type WaitForTaskArgs = z.infer<typeof waitForTaskSchema>;

/**
 * Schema for send_response tool arguments.
 */
export const sendResponseSchema = z.object({
  taskId: z.string().min(1).describe("The ID of the task being responded to"),
  status: TaskStatus.describe("The final status of the task"),
  message: z.string().min(1).describe("A textual response or summary of the result"),
  artifacts: z.array(z.string()).optional().describe("List of file paths or artifact IDs generated"),
  blockedReason: z.string().optional().describe("Reason for being blocked, required if status is BLOCKED")
});
export type SendResponseArgs = z.infer<typeof sendResponseSchema>;

/**
 * Schema for assign_task tool arguments.
 */
export const assignTaskSchema = z.object({
  targetAgentId: z.string().min(1).describe("The ID of the agent to assign the task to"),
  sourceAgentId: z.string().min(1).describe("The ID of the agent assigning the task"),
  prompt: z.string().min(1).describe("The task description/prompt"),
  context: z.record(z.unknown()).optional().describe("Additional context data for the task"),
  priority: z.enum(['high', 'normal', 'critical']).optional().default('normal').describe("Task priority")
});
export type AssignTaskArgs = z.infer<typeof assignTaskSchema>;

/**
 * Schema for list_agents tool arguments.
 */
export const listAgentsSchema = z.object({
  role: AgentRole.or(z.literal('any')).optional().describe("Filter agents by role")
});
export type ListAgentsArgs = z.infer<typeof listAgentsSchema>;

/**
 * Schema for get_agent_status tool arguments.
 */
export const getAgentStatusSchema = z.object({
  agentId: z.string().min(1).describe("The ID of the agent to check")
});
export type GetAgentStatusArgs = z.infer<typeof getAgentStatusSchema>;

/**
 * Schema for ack_task tool arguments.
 */
export const ackTaskSchema = z.object({
  taskId: z.string().min(1).describe("The ID of the task to acknowledge"),
  agentId: z.string().min(1).describe("The ID of the agent acknowledging the task")
});
export type AckTaskArgs = z.infer<typeof ackTaskSchema>;

/**
 * Schema for admin_update_agent tool arguments.
 */
export const adminUpdateAgentSchema = z.object({
  agentId: z.string().min(1).describe("The ID of the agent to update"),
  status: z.enum(['active', 'inactive', 'maintenance']).optional().describe("New status for the agent"),
  metadata: z.record(z.unknown()).optional().describe("Update metadata key-values")
});
export type AdminUpdateAgentArgs = z.infer<typeof adminUpdateAgentSchema>;

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
  'admin_update_agent'
] as const;
export type ToolName = typeof TOOL_NAMES[number];
