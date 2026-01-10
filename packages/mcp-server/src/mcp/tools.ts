/**
 * ToolHandler - Main MCP tool request handler
 * 
 * Orchestrates interactions between the AgentRepository and TaskQueue.
 * Delegates handler logic to specialized handler classes.
 */
import { AgentRepository } from '../state/agent-repository.js';
import { TaskQueue } from '../state/queue.js';
import { AgentHandlers, TaskHandlers, ReviewHandlers } from './handlers/index.js';
import {
  registerAgentSchema,
  waitForTaskSchema,
  sendResponseSchema,
  assignTaskSchema,
  listAgentsSchema,
  getAgentStatusSchema,
  ackTaskSchema,
  adminUpdateAgentSchema,
  createWaitForPromptSchema,
  DEFAULT_PROMPT_TIMEOUT,
  MAX_PROMPT_TIMEOUT,
  toMCPError,
} from '@opensourcewtf/waaah-types';

// Parse timeout from env
const PROMPT_TIMEOUT = process.env.WAAAH_PROMPT_TIMEOUT
  ? parseInt(process.env.WAAAH_PROMPT_TIMEOUT, 10)
  : DEFAULT_PROMPT_TIMEOUT;

const waitForPromptSchema = createWaitForPromptSchema(PROMPT_TIMEOUT, MAX_PROMPT_TIMEOUT);

// Re-export schemas for backward compatibility
export {
  registerAgentSchema,
  waitForPromptSchema,
  sendResponseSchema,
  assignTaskSchema,
  listAgentsSchema,
  getAgentStatusSchema,
  ackTaskSchema,
  adminUpdateAgentSchema,
};

/**
 * Main handler class that composes specialized handlers.
 */
export class ToolHandler {
  private agentHandlers: AgentHandlers;
  private taskHandlers: TaskHandlers;
  private reviewHandlers: ReviewHandlers;

  constructor(
    private registry: AgentRepository,
    private queue: TaskQueue
  ) {
    this.agentHandlers = new AgentHandlers(registry, queue);
    this.taskHandlers = new TaskHandlers(registry, queue);
    this.reviewHandlers = new ReviewHandlers(queue);
  }

  private handleError(error: unknown) {
    console.error('[ToolError]', error);
    return toMCPError(error);
  }

  // ===== Agent Handlers (Delegated) =====
  async register_agent(args: unknown) {
    return this.agentHandlers.register_agent(args);
  }

  async list_agents(args: unknown) {
    return this.agentHandlers.list_agents(args);
  }

  async get_agent_status(args: unknown) {
    return this.agentHandlers.get_agent_status(args);
  }

  async admin_update_agent(args: unknown) {
    return this.agentHandlers.admin_update_agent(args);
  }

  async admin_evict_agent(args: unknown) {
    return this.agentHandlers.admin_evict_agent(args);
  }

  // ===== Task Handlers (Delegated) =====
  async send_response(args: unknown) {
    return this.taskHandlers.send_response(args);
  }

  async assign_task(args: unknown) {
    return this.taskHandlers.assign_task(args);
  }

  async ack_task(args: unknown) {
    return this.taskHandlers.ack_task(args);
  }

  async block_task(args: unknown) {
    return this.taskHandlers.block_task(args);
  }

  async answer_task(args: unknown) {
    return this.taskHandlers.answer_task(args);
  }

  async get_task_context(args: unknown) {
    return this.taskHandlers.get_task_context(args);
  }

  async update_progress(args: unknown) {
    return this.taskHandlers.update_progress(args);
  }

  // ===== Review Handlers (Delegated) =====
  async scaffold_plan(args: unknown) {
    return this.reviewHandlers.scaffold_plan(args);
  }

  async submit_review(args: unknown) {
    return this.reviewHandlers.submit_review(args);
  }

  async get_review_comments(args: unknown, db: any) {
    return this.reviewHandlers.get_review_comments(args, db);
  }

  async resolve_review_comment(args: unknown, db: any) {
    return this.reviewHandlers.resolve_review_comment(args, db);
  }

  // ===== Wait Handlers (Kept inline - complex async logic) =====

  /**
   * LONG-POLLING implementation for agents to wait for new tasks.
   */
  async wait_for_prompt(args: unknown) {
    try {
      const params = waitForPromptSchema.parse(args);
      const timeoutMs = (params.timeout ?? 290) * 1000;
      console.log(`[Tool] Agent ${params.agentId} waiting for prompt (timeout: ${timeoutMs / 1000}s)...`);

      const agent = this.registry.get(params.agentId);
      const capabilities = agent?.capabilities || ['code-writing' as const];

      this.registry.heartbeat(params.agentId);
      const result = await this.queue.waitForTask(params.agentId, capabilities, timeoutMs);
      this.registry.heartbeat(params.agentId);

      if (!result) {
        return { content: [{ type: 'text', text: JSON.stringify({ status: 'TIMEOUT' }) }] };
      }

      if ('controlSignal' in result) {
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      const task = result as any;
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

  /**
   * Waits for a specific task to complete.
   */
  async wait_for_task(args: unknown) {
    try {
      const params = waitForTaskSchema.parse(args);
      const timeoutMs = (params.timeout ?? 300) * 1000;
      console.log(`[Tool] Waiting for task ${params.taskId} to complete (timeout: ${timeoutMs / 1000}s)...`);

      const task = await this.queue.waitForTaskCompletion(params.taskId, timeoutMs);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'NOT_FOUND', taskId: params.taskId }) }],
          isError: true
        };
      }

      const isComplete = ['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status);

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            taskId: task.id,
            status: task.status,
            completed: isComplete,
            response: task.response
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Broadcasts a system prompt to agents.
   */
  async broadcast_system_prompt(args: unknown) {
    try {
      const { broadcastSystemPromptSchema } = await import('@opensourcewtf/waaah-types');
      const params = broadcastSystemPromptSchema.parse(args);

      const targetAgents: string[] = [];

      if (params.broadcast) {
        targetAgents.push(...this.registry.getAll().map((a: { id: string }) => a.id));
      } else if (params.targetCapability) {
        const capAgents = this.registry.getAll().filter((a: { capabilities?: string[] }) =>
          a.capabilities?.includes(params.targetCapability!)
        );
        targetAgents.push(...capAgents.map((a: { id: string }) => a.id));
      } else if (params.targetAgentId) {
        targetAgents.push(params.targetAgentId);
      }

      if (targetAgents.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No agents matched' }) }] };
      }

      for (const agentId of targetAgents) {
        this.queue.queueSystemPrompt(agentId, params.promptType, params.message, params.payload, params.priority);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, targetCount: targetAgents.length, targets: targetAgents }) }]
      };
    } catch (e) { return this.handleError(e); }
  }
}
