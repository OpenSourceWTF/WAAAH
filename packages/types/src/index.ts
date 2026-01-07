import { z } from 'zod';

// ===== Core Types =====

export const AgentRoleSchema = z.enum([
  'boss',
  'project-manager',
  'full-stack-engineer',
  'test-engineer',
  'ops-engineer',
  'designer',
  'developer'
]);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const TaskStatusSchema = z.enum([
  'QUEUED',
  'PENDING_ACK',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'TIMEOUT'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['normal', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// ===== MCP Tool Schemas =====

export const registerAgentSchema = z.object({
  agentId: z.string().min(1),
  role: AgentRoleSchema,
  displayName: z.string().min(1),
  capabilities: z.array(z.string()).optional().default([])
});
export type RegisterAgentArgs = z.infer<typeof registerAgentSchema>;

export const waitForPromptSchema = z.object({
  agentId: z.string().min(1),
  timeout: z.number()
    .optional()
    .default(290)
    .transform((val) => {
      if (val > 300) return 290;  // Coerce to default max
      if (val < 1) return 1;       // Coerce to min
      return val;
    })
});
export type WaitForPromptArgs = z.infer<typeof waitForPromptSchema>;

export const sendResponseSchema = z.object({
  taskId: z.string().min(1),
  status: TaskStatusSchema,
  message: z.string(),
  artifacts: z.array(z.string()).optional(),
  blockedReason: z.string().optional()
});
export type SendResponseArgs = z.infer<typeof sendResponseSchema>;

export const assignTaskSchema = z.object({
  targetAgentId: z.string().min(1),
  prompt: z.string().min(1),
  priority: TaskPrioritySchema.optional().default('normal'),
  context: z.record(z.unknown()).optional(),
  sourceAgentId: z.string().optional()
});
export type AssignTaskArgs = z.infer<typeof assignTaskSchema>;

export const listAgentsSchema = z.object({
  role: AgentRoleSchema.optional()
});
export type ListAgentsArgs = z.infer<typeof listAgentsSchema>;

export const getAgentStatusSchema = z.object({
  agentId: z.string().min(1)
});
export type GetAgentStatusArgs = z.infer<typeof getAgentStatusSchema>;

export const ackTaskSchema = z.object({
  taskId: z.string().min(1),
  agentId: z.string().min(1)
});
export type AckTaskArgs = z.infer<typeof ackTaskSchema>;

export const adminUpdateAgentSchema = z.object({
  agentId: z.string().min(1),
  displayName: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
});
export type AdminUpdateAgentArgs = z.infer<typeof adminUpdateAgentSchema>;

// ===== Entity Types =====

export interface AgentIdentity {
  id: string;
  role: AgentRole;
  displayName: string;
  capabilities: string[];
  color?: string;
}

export interface Task {
  id: string;
  command: 'wait_for_prompt' | 'execute_prompt';
  prompt: string;
  from: {
    type: 'user' | 'agent';
    id: string;
    name: string;
  };
  to: {
    agentId?: string;
    role?: AgentRole;
  };
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: string; // Agent ID that accepted/ACKed the task
  response?: TaskResponse;
  context?: Record<string, unknown>;
  createdAt: number;
  timeoutAt?: number;
  completedAt?: number;
  failedAt?: number;
}

export interface TaskResponse {
  taskId: string;
  status: TaskStatus;
  message: string;
  artifacts?: string[];
  blockedReason?: string;
  completedAt: number;
}

export interface AgentStatus {
  agentId: string;
  status: AgentConnectionStatus;
  lastSeen: number;
  currentTask?: string;
}

export type AgentConnectionStatus = 'OFFLINE' | 'WAITING' | 'PROCESSING';

// Wait for a specific task to complete
export const waitForTaskSchema = z.object({
  taskId: z.string().min(1),
  timeout: z.number()
    .optional()
    .default(300)
    .transform((val) => {
      if (val > 600) return 600;  // Max 10 minutes
      if (val < 1) return 1;
      return val;
    })
});
export type WaitForTaskArgs = z.infer<typeof waitForTaskSchema>;

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
