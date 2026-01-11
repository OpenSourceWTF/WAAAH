import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { ToolHandler } from '../mcp/tools.js';
import { initEventLog } from '../state/events.js';
import { createTaskRoutes, createReviewRoutes, createAgentRoutes, createSSERoutes } from '../routes/index.js';
import { WORKSPACE_ROOT } from './config.js';
import { requireApiKey } from './middleware.js';
import type { ProductionContext } from '../state/context.js';

const VALID_TOOLS = [
  'register_agent', 'wait_for_prompt', 'send_response', 'assign_task',
  'list_agents', 'get_agent_status', 'ack_task', 'admin_update_agent',
  'wait_for_task', 'admin_evict_agent',
  'get_task_context', 'block_task', 'answer_task', 'update_progress',
  'scaffold_plan', 'submit_review', 'broadcast_system_prompt',
  'get_review_comments', 'resolve_review_comment'
] as const;

type ToolName = typeof VALID_TOOLS[number];

export function createApp(ctx: ProductionContext) {
  const app = express();

  // Initialize event logging with database from context
  initEventLog(ctx.db);

  // Use services from context
  const { registry, queue } = ctx;
  
  // Initialize ToolHandler
  const tools = new ToolHandler(registry, queue);

  // Middleware
  app.use(cors());
  app.use(bodyParser.json());

  // ============================================
  // PUBLIC ROUTES (no authentication required)
  // ============================================

  // Health check - must be accessible for monitoring
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Serve Admin Dashboard static files ONLY (browser needs to load HTML/JS/CSS)
  app.use('/admin', express.static(path.join(WORKSPACE_ROOT, 'packages/mcp-server/public')));
  app.get('/admin/', (req, res) => res.redirect('/admin/index.html'));

  // ============================================
  // PROTECTED ROUTES (require API key)
  // ============================================

  // Debug state
  app.get('/debug/state', requireApiKey, (req, res) => {
    res.json({
      agents: registry.getAll(),
      tasks: queue.getAll().map(t => ({ id: t.id, status: t.status, to: t.to }))
    });
  });

  // Admin API endpoints (protected - dashboard JS includes API key)
  app.get('/admin/stats', requireApiKey, (req, res) => {
    res.json(queue.getStats());
  });

  app.get('/admin/logs', requireApiKey, (req, res) => {
    try {
      const logs = queue.getLogs(100);
      res.json(logs);
    } catch (e) {
      console.error('Failed to fetch logs:', e);
      res.json([]);
    }
  });

  app.post('/admin/queue/clear', requireApiKey, (req, res) => {
    queue.clear();
    res.json({ success: true, message: 'Queue cleared' });
  });

  // SPA fallback for client-side routing (public - serves HTML)
  // Must be BEFORE adminApiRouter to avoid auth middleware on SPA routes
  // API paths fall through to the protected router below
  app.get('/admin/*', (req, res, next) => {
    const apiPrefixes = ['/admin/tasks', '/admin/agents', '/admin/stats', '/admin/logs',
      '/admin/enqueue', '/admin/evict', '/admin/delegations', '/admin/bot', '/admin/review',
      '/admin/queue'];
    if (apiPrefixes.some(p => req.path.startsWith(p))) {
      return next(); // Let protected router handle API paths
    }
    res.sendFile(path.join(WORKSPACE_ROOT, 'packages/mcp-server/public/index.html'));
  });

  // Mount extracted route modules (protected)
  const adminApiRouter = express.Router();
  adminApiRouter.use(requireApiKey);
  adminApiRouter.use(createTaskRoutes({ queue, workspaceRoot: WORKSPACE_ROOT }));
  adminApiRouter.use(createReviewRoutes({ queue, db: ctx.db, workspaceRoot: WORKSPACE_ROOT }));
  adminApiRouter.use(createAgentRoutes({ registry, queue }));
  adminApiRouter.use(createSSERoutes({ queue }));
  app.use('/admin', adminApiRouter);

  // Tool Routing - Dynamic dispatch to ToolHandler methods
  app.post('/mcp/tools/:toolName', requireApiKey, async (req, res) => {
    const { toolName } = req.params;
    const args = req.body;

    if (!['wait_for_prompt', 'get_agent_status', 'list_connected_agents', 'wait_for_task'].includes(toolName)) {
      console.log(`[RPC] Call ${toolName}`);
    }

    if (!VALID_TOOLS.includes(toolName as ToolName)) {
      res.status(404).json({ error: `Tool ${toolName} not found` });
      return;
    }

    const method = tools[toolName as keyof typeof tools];
    if (typeof method !== 'function') {
      res.status(500).json({ error: `Tool ${toolName} not implemented` });
      return;
    }

    const dbDependentTools = ['get_review_comments', 'resolve_review_comment'];
    const result = dbDependentTools.includes(toolName)
      ? await (method as any).call(tools, args, ctx.db)
      : await (method as any).call(tools, args);
    res.json(result);
  });

  return app;
}
