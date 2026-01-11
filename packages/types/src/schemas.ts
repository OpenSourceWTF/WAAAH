import { z } from 'zod';

// ===== Core Types =====

/**
 * Standard capabilities that agents can have.
 * These are used for matching tasks to agents.
 */
export const StandardCapability = z.enum([
  'spec-writing',   // Planning, specifications, technical design
  'code-writing',   // Code development, implementation
  'test-writing',   // Testing, QA, verification
  'doc-writing',    // Documentation, technical writing
  'code-doctor'     // Code review, quality checks, static analysis (no source edits)
]);
export type StandardCapability = z.infer<typeof StandardCapability>;

/**
 * All standard capabilities combined (for orchestrator agents)
 */
export const ALL_CAPABILITIES: StandardCapability[] = [
  'spec-writing', 'code-writing', 'test-writing', 'doc-writing'
];

/**
 * Valid statuses for a task.
 * Tracks the lifecycle of a task from creation to completion or failure.
 */
export const TaskStatus = z.enum([
  // Queue states
  'QUEUED',
  'PENDING_ACK',

  // Work states
  'ASSIGNED',
  'IN_PROGRESS',
  'BLOCKED',

  // Review states
  'IN_REVIEW',
  'REJECTED',              // Explicit rejection → transitions to QUEUED

  // Approval queue states
  'APPROVED_QUEUED',       // User approved, waiting for agent pickup
  'APPROVED_PENDING_ACK',  // Agent picked up, waiting for ack

  // Terminal states
  'COMPLETED',
  'FAILED',
  'CANCELLED'
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/**
 * Connection status of an agent.
 */
export type AgentConnectionStatus = 'OFFLINE' | 'WAITING' | 'PROCESSING';

/**
 * Task priority levels.
 */
export const TaskPriority = z.enum(['normal', 'high', 'critical']);
export type TaskPriority = z.infer<typeof TaskPriority>;

// ===== Timing Constants =====

/**
 * Agent offline threshold - 5 minutes.
 * Used to determine if an agent is considered offline/stale.
 */
export const AGENT_OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Default wait timeout for agent prompt polling (290s).
 * Just under the 300s Antigravity hard limit.
 */
export const AGENT_WAIT_TIMEOUT_MS = 290 * 1000;

/**
 * Default timeout for waiting for task completion (300s).
 */
export const TASK_COMPLETION_TIMEOUT_MS = 300 * 1000;

/**
 * Cleanup interval for stale resources (5 minutes).
 */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

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

// ===== Limits =====

/**
 * Default limit for log queries.
 */
export const DEFAULT_LOG_LIMIT = 100;

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
 * Capabilities are the primary matching mechanism.
 */
export const registerAgentSchema = z.object({
  agentId: z.string().min(1).describe("Unique identifier for the agent"),
  displayName: z.string().optional().describe("Human-readable name for the agent (auto-generated if not provided)"),
  role: z.string().optional().describe("Role of the agent (e.g., 'full-stack-engineer')"),
  capabilities: z.array(StandardCapability).min(1).describe("Capabilities this agent has"),
  workspaceContext: workspaceContextSchema.optional().describe("Workspace the agent is working in"),
  source: z.enum(['CLI', 'IDE']).optional().default('IDE').describe("Source of the agent: CLI (waaah-agent wrapper) or IDE (Cursor/Claude/etc)")
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
 * Uses capabilities for matching, agentId as optional hint.
 */
export const assignTaskSchema = z.object({
  /** Optional: preferred agent (adds score, not required) */
  targetAgentId: z.string().min(1).optional().describe("HINT: Preferred agent ID (adds score, not required)"),
  /** @deprecated Use requiredCapabilities instead */
  targetRole: z.string().min(1).optional().describe("DEPRECATED: Ignored for matching"),
  /** Required capabilities for the task */
  requiredCapabilities: z.array(StandardCapability).optional().describe("Capabilities required to execute this task"),
  /** Workspace ID for affinity matching */
  workspaceId: z.string().optional().describe("Repository ID for workspace affinity (e.g., 'OpenSourceWTF/WAAAH')"),
  sourceAgentId: z.string().min(1).optional().default('Da Boss').describe("The ID of the agent assigning the task (defaults to 'Da Boss')"),
  prompt: z.string().min(1).describe("The task description/prompt"),
  context: z.record(z.unknown()).optional().describe("Additional context data for the task"),
  /** Optional: specification document text for spec-driven development (S17) */
  spec: z.string().optional().describe("Raw text of specification document (e.g., spec.md contents)"),
  /** Optional: task checklist text for spec-driven development (S17) */
  tasks: z.string().optional().describe("Raw text of task checklist (e.g., tasks.md contents)"),
  priority: z.enum(['high', 'normal', 'critical']).optional().default('normal').describe("Task priority"),
  dependencies: z.array(z.string()).optional().describe("List of Task IDs that must complete before this task starts")
});
export type AssignTaskArgs = z.infer<typeof assignTaskSchema>;

/**
 * Schema for list_agents tool arguments.
 */
export const listAgentsSchema = z.object({
  capability: StandardCapability.optional().describe("Filter agents by capability")
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
  targetCapability: StandardCapability.optional().describe("Target agents with this capability"),
  broadcast: z.boolean().optional().describe("If true, send to ALL agents"),
  promptType: z.enum(['WORKFLOW_UPDATE', 'EVICTION_NOTICE', 'CONFIG_UPDATE', 'SYSTEM_MESSAGE']).describe("Type of system prompt"),
  message: z.string().min(1).describe("Human-readable message"),
  payload: z.record(z.unknown()).optional().describe("Optional payload data"),
  priority: z.enum(['normal', 'high', 'critical']).optional().default('normal').describe("Urgency level")
}).refine(data => data.targetAgentId || data.targetCapability || data.broadcast, {
  message: "Either targetAgentId, targetCapability, or broadcast must be specified"
});
export type BroadcastSystemPromptArgs = z.infer<typeof broadcastSystemPromptSchema>;

/**
 * Schema for get_review_comments tool arguments.
 * Allows agents to retrieve unresolved review comments for a task.
 */
export const getReviewCommentsSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task to get review comments for"),
  unresolvedOnly: z.boolean().optional().default(true).describe("Only return unresolved comments")
});
export type GetReviewCommentsArgs = z.infer<typeof getReviewCommentsSchema>;

/**
 * Schema for resolve_review_comment tool arguments.
 * Allows agents to acknowledge and resolve review feedback.
 */
export const resolveReviewCommentSchema = z.object({
  taskId: z.string().min(1).describe("ID of the task"),
  commentId: z.string().min(1).describe("ID of the review comment to resolve"),
  response: z.string().optional().describe("Optional response explaining the fix")
});
export type ResolveReviewCommentArgs = z.infer<typeof resolveReviewCommentSchema>;
