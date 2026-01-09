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
  'code-monk',
  'orchestrator'
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
  'IN_PROGRESS',
  'IN_REVIEW',
  'APPROVED',
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
 * Schema for workspace context - where an agent is working.
 */
export const workspaceContextSchema = z.object({
  type: z.enum(['local', 'github']).describe("Workspace type"),
  repoId: z.string().describe("Repository identifier (e.g., 'OpenSourceWTF/WAAAH')"),
  branch: z.string().optional().describe("Current branch name"),
  path: z.string().optional().describe("Local filesystem path")
});
export type WorkspaceContext = z.infer<typeof workspaceContextSchema>;

/**
 * Schema for register_agent tool arguments.
 */
export const registerAgentSchema = z.object({
  agentId: z.string().min(1).describe("Unique identifier for the agent"),
  role: AgentRole.describe("The role of the agent"),
  displayName: z.string().optional().describe("Human-readable name for the agent (auto-generated if not provided)"),
  capabilities: z.array(z.string()).optional().describe("List of capabilities/tools the agent has"),
  workspaceContext: workspaceContextSchema.optional().describe("Workspace the agent is working in")
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
  targetAgentId: z.string().min(1).optional().describe("The ID of the agent to assign the task to (optional if role provided)"),
  targetRole: z.string().min(1).optional().describe("The role to target (optional if agentId provided)"),
  sourceAgentId: z.string().min(1).optional().default('Da Boss').describe("The ID of the agent assigning the task (defaults to 'Da Boss')"),
  prompt: z.string().min(1).describe("The task description/prompt"),
  context: z.record(z.unknown()).optional().describe("Additional context data for the task"),
  priority: z.enum(['high', 'normal', 'critical']).optional().default('normal').describe("Task priority"),
  dependencies: z.array(z.string()).optional().describe("List of Task IDs that must complete before this task starts")
}).refine(data => data.targetAgentId || data.targetRole, {
  message: "Either targetAgentId or targetRole must be provided"
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

/**
 * Schema for block_task tool arguments.
 */
export const blockTaskSchema = z.object({
  taskId: z.string().min(1).describe("The ID of the task to block"),
  reason: z.enum(['clarification', 'dependency', 'decision']).describe("Category of the blocker"),
  question: z.string().min(1).describe("The question or issue that needs resolution"),
  summary: z.string().min(1).describe("Summary of work done so far"),
  notes: z.string().optional().describe("Private notes/state to help resumption"),
  files: z.array(z.string()).optional().describe("Files modified or relevant to the task")
});
export type BlockTaskArgs = z.infer<typeof blockTaskSchema>;

/**
 * Schema for answer_task tool arguments.
 */
export const answerTaskSchema = z.object({
  taskId: z.string().min(1).describe("The ID of the blocked task"),
  answer: z.string().min(1).describe("The answer or resolution to the blocker")
});
export type AnswerTaskArgs = z.infer<typeof answerTaskSchema>;

/**
 * Schema for get_task_context tool arguments.
 */
export const getTaskContextSchema = z.object({
  taskId: z.string().min(1).describe("The ID of the task")
});
export type GetTaskContextArgs = z.infer<typeof getTaskContextSchema>;


// Worktree Tools




export const scaffoldPlanSchema = z.object({
  taskId: z.string().min(1).describe("The Task ID context for the plan")
});
export type ScaffoldPlanArgs = z.infer<typeof scaffoldPlanSchema>;

export const submitReviewSchema = z.object({
  taskId: z.string().min(1).describe("The Task ID being submitted"),
  message: z.string().min(1).describe("Commit message and review description"),
  runTests: z.boolean().optional().default(true).describe("Whether to enforce test execution")
});
export type SubmitReviewArgs = z.infer<typeof submitReviewSchema>;

/**
 * Schema for update_progress tool arguments.
 * Allows agents to report step-by-step observations during task execution.
 */
export const updateProgressSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task to update"),
  agentId: z.string().min(1).describe("ID of the agent reporting progress"),
  phase: z.string().optional().describe("Current phase (e.g., PLANNING, BUILDING, TESTING)"),
  message: z.string().min(1).describe("Progress observation/message"),
  percentage: z.number().min(0).max(100).optional().describe("Optional completion percentage")
});
export type UpdateProgressArgs = z.infer<typeof updateProgressSchema>;

/**
 * Schema for broadcast_system_prompt tool arguments.
 * Sends system-level prompts to agents (workflow updates, config changes, etc.)
 */
export const broadcastSystemPromptSchema = z.object({
  targetAgentId: z.string().optional().describe("Specific agent ID to target"),
  targetRole: AgentRole.optional().describe("Target all agents with this role"),
  broadcast: z.boolean().optional().describe("If true, send to ALL agents"),
  promptType: z.enum(['WORKFLOW_UPDATE', 'EVICTION_NOTICE', 'CONFIG_UPDATE', 'SYSTEM_MESSAGE']).describe("Type of system prompt"),
  message: z.string().min(1).describe("Human-readable message"),
  payload: z.record(z.unknown()).optional().describe("Optional payload data"),
  priority: z.enum(['normal', 'high', 'critical']).optional().default('normal').describe("Urgency level")
}).refine(data => data.targetAgentId || data.targetRole || data.broadcast, {
  message: "Either targetAgentId, targetRole, or broadcast must be specified"
});
export type BroadcastSystemPromptArgs = z.infer<typeof broadcastSystemPromptSchema>;
