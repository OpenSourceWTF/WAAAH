import { z } from 'zod';
/**
 * Valid roles for agents within the WAAAH system.
 * These roles determine the capabilities and responsibilities of an agent.
 */
export declare const AgentRole: z.ZodEnum<["boss", "project-manager", "full-stack-engineer", "test-engineer", "ops-engineer", "designer", "developer", "code-monk"]>;
export type AgentRole = z.infer<typeof AgentRole>;
/**
 * Valid statuses for a task.
 * Tracks the lifecycle of a task from creation to completion or failure.
 */
export declare const TaskStatus: z.ZodEnum<["QUEUED", "PENDING_ACK", "ASSIGNED", "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED", "CANCELLED"]>;
export type TaskStatus = z.infer<typeof TaskStatus>;
/**
 * Connection status of an agent.
 */
export type AgentConnectionStatus = 'OFFLINE' | 'WAITING' | 'PROCESSING';
/**
 * Default internal prompt timeout in seconds.
 * Can be overridden by WAAAH_PROMPT_TIMEOUT env var.
 */
export declare const DEFAULT_PROMPT_TIMEOUT = 290;
/**
 * Maximum allowed prompt timeout in seconds.
 * Hard limit to prevent excessive blocking.
 */
export declare const MAX_PROMPT_TIMEOUT = 300;
/**
 * Factory function to create a Zod schema for wait_for_prompt arguments.
 * Allows injecting a configurable default timeout.
 *
 * @param defaultTimeout - The default timeout in seconds to use if not provided in args.
 * @param maxTimeout - The maximum allowed timeout in seconds to enforce.
 * @returns A Zod schema for validating wait_for_prompt arguments.
 */
export declare const createWaitForPromptSchema: (defaultTimeout?: number, maxTimeout?: number) => z.ZodObject<{
    agentId: z.ZodString;
    timeout: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodNumber>>, number, number | undefined>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    agentId: string;
}, {
    agentId: string;
    timeout?: number | undefined;
}>;
/**
 * Standard schema for wait_for_prompt tool.
 * Uses the default constants.
 */
export declare const waitForPromptSchema: z.ZodObject<{
    agentId: z.ZodString;
    timeout: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodNumber>>, number, number | undefined>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    agentId: string;
}, {
    agentId: string;
    timeout?: number | undefined;
}>;
export type WaitForPromptArgs = z.infer<typeof waitForPromptSchema>;
/**
 * Schema for register_agent tool arguments.
 */
export declare const registerAgentSchema: z.ZodObject<{
    agentId: z.ZodString;
    role: z.ZodEnum<["boss", "project-manager", "full-stack-engineer", "test-engineer", "ops-engineer", "designer", "developer", "code-monk"]>;
    displayName: z.ZodOptional<z.ZodString>;
    capabilities: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    role: "boss" | "project-manager" | "full-stack-engineer" | "test-engineer" | "ops-engineer" | "designer" | "developer" | "code-monk";
    agentId: string;
    displayName?: string | undefined;
    capabilities?: string[] | undefined;
}, {
    role: "boss" | "project-manager" | "full-stack-engineer" | "test-engineer" | "ops-engineer" | "designer" | "developer" | "code-monk";
    agentId: string;
    displayName?: string | undefined;
    capabilities?: string[] | undefined;
}>;
export type RegisterAgentArgs = z.infer<typeof registerAgentSchema>;
/**
 * Schema for wait_for_task tool arguments.
 */
export declare const waitForTaskSchema: z.ZodObject<{
    taskId: z.ZodString;
    timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    timeout: number;
    taskId: string;
}, {
    taskId: string;
    timeout?: number | undefined;
}>;
export type WaitForTaskArgs = z.infer<typeof waitForTaskSchema>;
/**
 * Schema for send_response tool arguments.
 */
export declare const sendResponseSchema: z.ZodObject<{
    taskId: z.ZodString;
    status: z.ZodEnum<["QUEUED", "PENDING_ACK", "ASSIGNED", "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED", "BLOCKED", "CANCELLED"]>;
    message: z.ZodString;
    artifacts: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    blockedReason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    message: string;
    status: "QUEUED" | "PENDING_ACK" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "BLOCKED" | "PENDING" | "CANCELLED";
    taskId: string;
    artifacts?: string[] | undefined;
    blockedReason?: string | undefined;
}, {
    message: string;
    status: "QUEUED" | "PENDING_ACK" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "BLOCKED" | "PENDING" | "CANCELLED";
    taskId: string;
    artifacts?: string[] | undefined;
    blockedReason?: string | undefined;
}>;
export type SendResponseArgs = z.infer<typeof sendResponseSchema>;
/**
 * Schema for assign_task tool arguments.
 */
export declare const assignTaskSchema: z.ZodObject<{
    targetAgentId: z.ZodString;
    sourceAgentId: z.ZodString;
    prompt: z.ZodString;
    context: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    priority: z.ZodDefault<z.ZodOptional<z.ZodEnum<["high", "normal", "critical"]>>>;
}, "strip", z.ZodTypeAny, {
    prompt: string;
    priority: "normal" | "high" | "critical";
    targetAgentId: string;
    sourceAgentId: string;
    context?: Record<string, unknown> | undefined;
}, {
    prompt: string;
    targetAgentId: string;
    sourceAgentId: string;
    context?: Record<string, unknown> | undefined;
    priority?: "normal" | "high" | "critical" | undefined;
}>;
export type AssignTaskArgs = z.infer<typeof assignTaskSchema>;
/**
 * Schema for list_agents tool arguments.
 */
export declare const listAgentsSchema: z.ZodObject<{
    role: z.ZodOptional<z.ZodUnion<[z.ZodEnum<["boss", "project-manager", "full-stack-engineer", "test-engineer", "ops-engineer", "designer", "developer", "code-monk"]>, z.ZodLiteral<"any">]>>;
}, "strip", z.ZodTypeAny, {
    role?: "any" | "boss" | "project-manager" | "full-stack-engineer" | "test-engineer" | "ops-engineer" | "designer" | "developer" | "code-monk" | undefined;
}, {
    role?: "any" | "boss" | "project-manager" | "full-stack-engineer" | "test-engineer" | "ops-engineer" | "designer" | "developer" | "code-monk" | undefined;
}>;
export type ListAgentsArgs = z.infer<typeof listAgentsSchema>;
/**
 * Schema for get_agent_status tool arguments.
 */
export declare const getAgentStatusSchema: z.ZodObject<{
    agentId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    agentId: string;
}, {
    agentId: string;
}>;
export type GetAgentStatusArgs = z.infer<typeof getAgentStatusSchema>;
/**
 * Schema for ack_task tool arguments.
 */
export declare const ackTaskSchema: z.ZodObject<{
    taskId: z.ZodString;
    agentId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    taskId: string;
}, {
    agentId: string;
    taskId: string;
}>;
export type AckTaskArgs = z.infer<typeof ackTaskSchema>;
/**
 * Schema for admin_update_agent tool arguments.
 */
export declare const adminUpdateAgentSchema: z.ZodObject<{
    agentId: z.ZodString;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive", "maintenance"]>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    agentId: string;
    status?: "active" | "inactive" | "maintenance" | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    agentId: string;
    status?: "active" | "inactive" | "maintenance" | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type AdminUpdateAgentArgs = z.infer<typeof adminUpdateAgentSchema>;
/**
 * Interface representing the identity and capabilities of an agent.
 */
export interface AgentIdentity {
    /** Unique ID of the agent (e.g. "fullstack-1") */
    id: string;
    role: AgentRole;
    displayName?: string;
    capabilities: string[];
    status?: 'idle' | 'busy' | 'offline';
    lastSeen?: number;
    color?: string;
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
    to: {
        agentId?: string;
        role?: AgentRole;
    };
    context?: Record<string, unknown>;
    createdAt: number;
    completedAt?: number;
    assignedTo?: string;
    response?: any;
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
export declare const TOOL_NAMES: readonly ["register_agent", "wait_for_prompt", "wait_for_task", "send_response", "assign_task", "list_agents", "get_agent_status", "ack_task", "admin_update_agent"];
export type ToolName = typeof TOOL_NAMES[number];
