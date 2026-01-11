/**
 * ToolHandler - Main MCP tool request handler
 * 
 * Orchestrates interactions between the AgentRepository and TaskQueue.
 * Delegates handler logic to specialized handler classes.
 */
import { AgentRepository } from '../state/persistence/agent-repository.js';
import { TaskQueue } from '../state/queue.js';
import { AgentHandlers, TaskHandlers, ReviewHandlers } from './handlers/index.js';
import { WaitHandlers } from './handlers/wait-handlers.js';
import {
  registerAgentSchema,
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
  private waitHandlers: WaitHandlers;

  constructor(
    private registry: AgentRepository,
    private queue: TaskQueue
  ) {
    this.agentHandlers = new AgentHandlers(registry, queue);
    this.taskHandlers = new TaskHandlers(registry, queue);
    this.reviewHandlers = new ReviewHandlers(queue);
    this.waitHandlers = new WaitHandlers(registry, queue);
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

  // ===== Wait Handlers (Delegated) =====

  async wait_for_prompt(args: unknown) {
    return this.waitHandlers.wait_for_prompt(args);
  }

  async wait_for_task(args: unknown) {
    return this.waitHandlers.wait_for_task(args);
  }

  async broadcast_system_prompt(args: unknown) {
    return this.waitHandlers.broadcast_system_prompt(args);
  }
}
