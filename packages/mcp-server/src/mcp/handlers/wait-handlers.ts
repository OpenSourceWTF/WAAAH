import { AgentRepository } from '../../state/persistence/agent-repository.js';
import { TaskQueue } from '../../state/queue.js';
import {
  waitForTaskSchema,
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

export class WaitHandlers {
  constructor(
    private registry: AgentRepository,
    private queue: TaskQueue
  ) { }

  private handleError(error: unknown) {
    console.error('[ToolError]', error);
    return toMCPError(error);
  }

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
      const workspaceContext = agent?.workspaceContext; // Extract stored workspace info

      this.registry.heartbeat(params.agentId);
      const result = await this.queue.waitForTask(params.agentId, capabilities, workspaceContext, timeoutMs);
      this.registry.heartbeat(params.agentId);

      if (!result) {
        // Build response with IDLE status
        const response: { success: boolean; status: string; message: string; prompt?: string } = {
          success: true,
          status: 'IDLE',
          message: 'No tasks available. Waiting.'
        };

        // Add reconnect prompt only for specific roles
        const role = agent?.role?.toLowerCase() || '';
        const reconnectRoles = ['pm', 'coding', 'testing', 'orchestrator'];
        if (reconnectRoles.some(r => role.includes(r))) {
          response.prompt = '## REQUIRED ACTION\nCall wait_for_prompt again to continue listening.';
        }

        return { content: [{ type: 'text', text: JSON.stringify(response) }] };
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
