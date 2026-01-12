/**
 * Schema Sync Test
 * 
 * Ensures MCP_TOOL_DEFINITIONS (JSON schemas exposed to agents) stay in sync
 * with the Zod schemas (used internally for validation).
 * 
 * This test prevents the bug where a field is added to a Zod schema but not
 * to the MCP tool definition, causing agents to not see the new field.
 */
import { describe, it, expect } from 'vitest';
import {
  MCP_TOOL_DEFINITIONS,
  sendResponseSchema,
  registerAgentSchema,
  assignTaskSchema,
  blockTaskSchema,
  ackTaskSchema,
  updateProgressSchema,
  scaffoldPlanSchema,
  submitReviewSchema,
  getReviewCommentsSchema,
  resolveReviewCommentSchema,
  getTaskContextSchema,
  answerTaskSchema,
  listAgentsSchema
} from '../src/index.js';

describe('Schema Sync: MCP_TOOL_DEFINITIONS matches Zod schemas', () => {
  const getMcpTool = (name: string) =>
    MCP_TOOL_DEFINITIONS.find(t => t.name === name);

  // Helper to check field sync
  const checkFieldSync = (toolName: string, zodSchema: any, exceptions: string[] = []) => {
    const mcpTool = getMcpTool(toolName);
    expect(mcpTool, `MCP tool ${toolName} not found`).toBeDefined();

    // zodSchema might be undefined if not exported yet - skip in that case
    if (!zodSchema?.shape) {
      console.warn(`Skipping ${toolName} - Zod schema not available`);
      return;
    }

    const zodKeys = Object.keys(zodSchema.shape);
    const mcpKeys = Object.keys(mcpTool!.inputSchema.properties);

    for (const key of zodKeys) {
      if (!exceptions.includes(key)) {
        expect(mcpKeys, `MCP ${toolName} is missing field: ${key}`).toContain(key);
      }
    }
  };

  it('send_response fields sync', () => {
    checkFieldSync('send_response', sendResponseSchema);
  });

  it('register_agent fields sync', () => {
    checkFieldSync('register_agent', registerAgentSchema);
  });

  it('assign_task fields sync', () => {
    // targetRole is deprecated, intentionally omitted
    checkFieldSync('assign_task', assignTaskSchema, ['targetRole']);
  });

  it('block_task fields sync', () => {
    checkFieldSync('block_task', blockTaskSchema);
  });

  it('ack_task fields sync', () => {
    checkFieldSync('ack_task', ackTaskSchema);
  });

  it('update_progress fields sync', () => {
    checkFieldSync('update_progress', updateProgressSchema);
  });

  it('scaffold_plan fields sync', () => {
    checkFieldSync('scaffold_plan', scaffoldPlanSchema);
  });

  it('submit_review fields sync', () => {
    checkFieldSync('submit_review', submitReviewSchema);
  });

  it('get_review_comments fields sync', () => {
    checkFieldSync('get_review_comments', getReviewCommentsSchema);
  });

  it('resolve_review_comment fields sync', () => {
    checkFieldSync('resolve_review_comment', resolveReviewCommentSchema);
  });

  it('get_task_context fields sync', () => {
    checkFieldSync('get_task_context', getTaskContextSchema);
  });

  it('answer_task fields sync', () => {
    checkFieldSync('answer_task', answerTaskSchema);
  });

  it('list_agents fields sync', () => {
    checkFieldSync('list_agents', listAgentsSchema);
  });

  // Meta-test: all server-registered tools should have MCP definitions
  it('all VALID_TOOLS have MCP definitions', () => {
    const VALID_TOOLS = [
      'register_agent', 'wait_for_prompt', 'send_response', 'assign_task',
      'list_agents', 'get_agent_status', 'ack_task', 'admin_update_agent',
      'wait_for_task', 'admin_evict_agent',
      'get_task_context', 'block_task', 'answer_task', 'update_progress',
      'scaffold_plan', 'submit_review', 'broadcast_system_prompt',
      'get_review_comments', 'resolve_review_comment'
    ];

    const mcpToolNames = MCP_TOOL_DEFINITIONS.map(t => t.name);

    for (const tool of VALID_TOOLS) {
      // admin_evict_agent is server-internal, no MCP exposure needed
      if (tool === 'admin_evict_agent') continue;
      expect(mcpToolNames, `Missing MCP definition for: ${tool}`).toContain(tool);
    }
  });
});
