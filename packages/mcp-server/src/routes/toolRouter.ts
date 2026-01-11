/**
 * Tool router factory
 * Extracted from server.ts to reduce complexity
 * 
 * Includes centralized heartbeat handling with debouncing.
 */
import express from 'express';
import type { ToolHandler } from '../mcp/tools.js';
import type { ServerContext } from '../state/context.js';
import { processHeartbeat } from '../mcp/heartbeat-middleware.js';

const VALID_TOOLS = [
  'register_agent', 'wait_for_prompt', 'send_response', 'assign_task',
  'list_agents', 'get_agent_status', 'ack_task', 'admin_update_agent',
  'wait_for_task', 'admin_evict_agent',
  'get_task_context', 'block_task', 'answer_task', 'update_progress',
  'scaffold_plan', 'submit_review', 'broadcast_system_prompt',
  'get_review_comments', 'resolve_review_comment'
] as const;

type ToolName = typeof VALID_TOOLS[number];

const QUIET_TOOLS = ['wait_for_prompt', 'get_agent_status', 'list_connected_agents', 'wait_for_task'];
const DB_DEPENDENT_TOOLS = ['get_review_comments', 'resolve_review_comment'];

export function createToolRouter(tools: ToolHandler, ctx: ServerContext) {
  const router = express.Router();

  router.post('/:toolName', async (req, res) => {
    const { toolName } = req.params;
    const args = req.body;

    if (!QUIET_TOOLS.includes(toolName)) {
      console.log(`[RPC] Call ${toolName}`);
    }

    if (!VALID_TOOLS.includes(toolName as ToolName)) {
      res.status(404).json({ error: `Tool ${toolName} not found` });
      return;
    }

    // Centralized heartbeat processing with debouncing
    // Triggers on ANY tool call, but writes max once per 10s per agent
    processHeartbeat(toolName, args, {
      heartbeat: (agentId: string) => ctx.registry.heartbeat(agentId)
    });

    const method = tools[toolName as keyof typeof tools];
    if (typeof method !== 'function') {
      res.status(500).json({ error: `Tool ${toolName} not implemented` });
      return;
    }

    const result = DB_DEPENDENT_TOOLS.includes(toolName)
      ? await (method as any).call(tools, args, ctx.db)
      : await (method as any).call(tools, args);
    res.json(result);
  });

  return router;
}
