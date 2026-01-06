import { z } from 'zod';
import { AgentRegistry } from '../state/registry.js';
import { TaskQueue } from '../state/queue.js';
import { AgentRole, TaskStatus, TaskPriority } from '@waaah/types';

export const registerAgentSchema = z.object({
  agentId: z.string(),
  role: z.custom<AgentRole>(),
  displayName: z.string(),
  capabilities: z.array(z.string())
});

export const waitForPromptSchema = z.object({
  agentId: z.string(),
  timeout: z.number().optional()
});

export const sendResponseSchema = z.object({
  taskId: z.string(),
  status: z.custom<TaskStatus>(),
  message: z.string(),
  artifacts: z.array(z.string()).optional(),
  blockedReason: z.string().optional()
});

export const assignTaskSchema = z.object({
  targetAgentId: z.string(),
  prompt: z.string(),
  priority: z.custom<TaskPriority>().optional(),
  context: z.record(z.string(), z.unknown()).optional()
});

export const listAgentsSchema = z.object({
  role: z.custom<AgentRole>().optional()
});

export const getAgentStatusSchema = z.object({
  agentId: z.string()
});

export const ackTaskSchema = z.object({
  taskId: z.string(),
  agentId: z.string()
});

export class ToolHandler {
  constructor(
    private registry: AgentRegistry,
    private queue: TaskQueue
  ) { }

  async handleError(error: unknown) {
    console.error('[ToolError]', error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
  }

  async register_agent(args: unknown) {
    try {
      const params = registerAgentSchema.parse(args);
      this.registry.register({
        id: params.agentId,
        role: params.role,
        displayName: params.displayName,
        capabilities: params.capabilities
      });
      return {
        content: [{ type: 'text', text: `Registered agent ${params.agentId} as ${params.role}` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  async wait_for_prompt(args: unknown) {
    try {
      const params = waitForPromptSchema.parse(args);
      // This blocks!
      console.log(`[Tool] Agent ${params.agentId} waiting for prompt...`);

      // Look up agent's role for role-based dispatching
      const agent = this.registry.get(params.agentId);
      const role = agent?.role || 'developer';

      const task = await this.queue.waitForTask(params.agentId, role, params.timeout);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'TIMEOUT' }) }]
        };
      }

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            taskId: task.id,
            prompt: task.prompt,
            from: task.from,
            priority: task.priority,
            context: task.context
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  async send_response(args: unknown) {
    try {
      const params = sendResponseSchema.parse(args);
      this.queue.updateStatus(params.taskId, params.status, {
        message: params.message,
        artifacts: params.artifacts,
        blockedReason: params.blockedReason
      });
      console.log(`[Tool] Response from task ${params.taskId}: ${params.status}`);
      return {
        content: [{ type: 'text', text: `Response recorded for ${params.taskId}` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  async assign_task(args: unknown) {
    try {
      const params = assignTaskSchema.parse(args);

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      // For now, sender is hardcoded or could be inferred if we passed current agent context
      // But since tools are generic, we'll assume it comes from "system" or context if not provided
      // Ideally, the mcp request itself should have sender info.

      this.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: params.prompt,
        from: { type: 'agent', id: 'unknown', name: 'Delegator' }, // TODO: Pass caller config
        to: { agentId: params.targetAgentId },
        priority: params.priority || 'normal',
        status: 'QUEUED',
        createdAt: Date.now(),
        context: params.context
      });

      return {
        content: [{ type: 'text', text: `Task assigned: ${taskId}` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  async list_agents(args: unknown) {
    try {
      const params = listAgentsSchema.parse(args);
      const agents = this.registry.getAll();
      const filtered = params.role ? agents.filter(a => a.role === params.role) : agents;

      return {
        content: [{ type: 'text', text: JSON.stringify(filtered) }]
      };
    } catch (e) { return this.handleError(e); }
  }

  async get_agent_status(args: unknown) {
    try {
      const params = getAgentStatusSchema.parse(args);
      const agent = this.registry.get(params.agentId);

      if (!agent) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'UNKNOWN' }) }],
          isError: true
        };
      }

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            agentId: agent.id,
            status: 'ONLINE', // In real impl, check heartbeat
            role: agent.role
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  async ack_task(args: unknown) {
    try {
      const params = ackTaskSchema.parse(args);
      const result = this.queue.ackTask(params.taskId, params.agentId);

      if (!result.success) {
        return {
          content: [{ type: 'text', text: `ACK failed: ${result.error}` }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: `Task ${params.taskId} acknowledged` }]
      };
    } catch (e) { return this.handleError(e); }
  }
}
