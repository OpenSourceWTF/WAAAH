"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_NAMES = exports.adminUpdateAgentSchema = exports.ackTaskSchema = exports.getAgentStatusSchema = exports.listAgentsSchema = exports.assignTaskSchema = exports.sendResponseSchema = exports.waitForTaskSchema = exports.registerAgentSchema = exports.waitForPromptSchema = exports.createWaitForPromptSchema = exports.MAX_PROMPT_TIMEOUT = exports.DEFAULT_PROMPT_TIMEOUT = exports.TaskStatus = exports.AgentRole = void 0;
const zod_1 = require("zod");
// ===== Core Types =====
/**
 * Valid roles for agents within the WAAAH system.
 * These roles determine the capabilities and responsibilities of an agent.
 */
exports.AgentRole = zod_1.z.enum([
    'boss',
    'project-manager',
    'full-stack-engineer',
    'test-engineer',
    'ops-engineer',
    'designer',
    'developer',
    'code-monk'
]);
/**
 * Valid statuses for a task.
 * Tracks the lifecycle of a task from creation to completion or failure.
 */
exports.TaskStatus = zod_1.z.enum([
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
// ===== Constants =====
/**
 * Default internal prompt timeout in seconds.
 * Can be overridden by WAAAH_PROMPT_TIMEOUT env var.
 */
exports.DEFAULT_PROMPT_TIMEOUT = 290; // Default to 290s (just under 300s limit)
/**
 * Maximum allowed prompt timeout in seconds.
 * Hard limit to prevent excessive blocking.
 */
exports.MAX_PROMPT_TIMEOUT = 300;
// ===== Helper Factories =====
/**
 * Factory function to create a Zod schema for wait_for_prompt arguments.
 * Allows injecting a configurable default timeout.
 *
 * @param defaultTimeout - The default timeout in seconds to use if not provided in args.
 * @param maxTimeout - The maximum allowed timeout in seconds to enforce.
 * @returns A Zod schema for validating wait_for_prompt arguments.
 */
const createWaitForPromptSchema = (defaultTimeout = exports.DEFAULT_PROMPT_TIMEOUT, maxTimeout = exports.MAX_PROMPT_TIMEOUT) => zod_1.z.object({
    agentId: zod_1.z.string().min(1).describe("The ID of the agent waiting for a prompt"),
    timeout: zod_1.z.number()
        .optional()
        .default(defaultTimeout)
        .describe(`Timeout in seconds (default: ${defaultTimeout})`)
        .transform((val) => {
        // Cap at maxTimeout, ensure at least 1s
        if (val > maxTimeout)
            return defaultTimeout;
        if (val < 1)
            return 1;
        return val;
    })
});
exports.createWaitForPromptSchema = createWaitForPromptSchema;
// ===== Tool Schemas =====
/**
 * Standard schema for wait_for_prompt tool.
 * Uses the default constants.
 */
exports.waitForPromptSchema = (0, exports.createWaitForPromptSchema)();
/**
 * Schema for register_agent tool arguments.
 */
exports.registerAgentSchema = zod_1.z.object({
    agentId: zod_1.z.string().min(1).describe("Unique identifier for the agent"),
    role: exports.AgentRole.describe("The role of the agent"),
    displayName: zod_1.z.string().optional().describe("Human-readable name for the agent"),
    capabilities: zod_1.z.array(zod_1.z.string()).optional().describe("List of capabilities/tools the agent has")
});
/**
 * Schema for wait_for_task tool arguments.
 */
exports.waitForTaskSchema = zod_1.z.object({
    taskId: zod_1.z.string().min(1).describe("The ID of the task to wait for"),
    timeout: zod_1.z.number().optional().default(300).describe("Timeout in seconds (default: 300)")
});
/**
 * Schema for send_response tool arguments.
 */
exports.sendResponseSchema = zod_1.z.object({
    taskId: zod_1.z.string().min(1).describe("The ID of the task being responded to"),
    status: exports.TaskStatus.describe("The final status of the task"),
    message: zod_1.z.string().min(1).describe("A textual response or summary of the result"),
    artifacts: zod_1.z.array(zod_1.z.string()).optional().describe("List of file paths or artifact IDs generated"),
    blockedReason: zod_1.z.string().optional().describe("Reason for being blocked, required if status is BLOCKED")
});
/**
 * Schema for assign_task tool arguments.
 */
exports.assignTaskSchema = zod_1.z.object({
    targetAgentId: zod_1.z.string().min(1).describe("The ID of the agent to assign the task to"),
    sourceAgentId: zod_1.z.string().min(1).describe("The ID of the agent assigning the task"),
    prompt: zod_1.z.string().min(1).describe("The task description/prompt"),
    context: zod_1.z.record(zod_1.z.unknown()).optional().describe("Additional context data for the task"),
    priority: zod_1.z.enum(['high', 'normal', 'critical']).optional().default('normal').describe("Task priority")
});
/**
 * Schema for list_agents tool arguments.
 */
exports.listAgentsSchema = zod_1.z.object({
    role: exports.AgentRole.or(zod_1.z.literal('any')).optional().describe("Filter agents by role")
});
/**
 * Schema for get_agent_status tool arguments.
 */
exports.getAgentStatusSchema = zod_1.z.object({
    agentId: zod_1.z.string().min(1).describe("The ID of the agent to check")
});
/**
 * Schema for ack_task tool arguments.
 */
exports.ackTaskSchema = zod_1.z.object({
    taskId: zod_1.z.string().min(1).describe("The ID of the task to acknowledge"),
    agentId: zod_1.z.string().min(1).describe("The ID of the agent acknowledging the task")
});
/**
 * Schema for admin_update_agent tool arguments.
 */
exports.adminUpdateAgentSchema = zod_1.z.object({
    agentId: zod_1.z.string().min(1).describe("The ID of the agent to update"),
    status: zod_1.z.enum(['active', 'inactive', 'maintenance']).optional().describe("New status for the agent"),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional().describe("Update metadata key-values")
});
// ===== Tool Names =====
exports.TOOL_NAMES = [
    'register_agent',
    'wait_for_prompt',
    'wait_for_task',
    'send_response',
    'assign_task',
    'list_agents',
    'get_agent_status',
    'ack_task',
    'admin_update_agent'
];
