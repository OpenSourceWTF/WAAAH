/**
 * Main Express server entry point for the WAAAH MCP.
 * Configures middleware, API routes, and tool handling.
 */
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { ToolHandler } from './mcp/tools.js';
import { initEventLog } from './state/events.js';
import { createProductionContext } from './state/context.js';
import { CLEANUP_INTERVAL_MS } from '@opensourcewtf/waaah-types';
import { emitActivity } from './state/events.js';
import { createTaskRoutes, createReviewRoutes, createAgentRoutes, createSSERoutes } from './routes/index.js';
import { getOrCreateApiKey } from './utils/auth.js';

dotenv.config();

const PORT = process.env.WAAAH_PORT || process.env.PORT || 3000;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

const API_KEY = getOrCreateApiKey();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Create production context with all dependencies
const ctx = createProductionContext();

// Initialize event logging with database from context
initEventLog(ctx.db);

// Use services from context
const { registry, queue } = ctx;
queue.startScheduler();

const tools = new ToolHandler(registry, queue);

// Middleware
app.use(cors());
app.use(bodyParser.json());

/**
 * API Key Authentication Middleware
 * Validates X-API-Key header or apiKey query param
 */
function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (providedKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    return;
  }
  next();
}

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
const VALID_TOOLS = [
  'register_agent', 'wait_for_prompt', 'send_response', 'assign_task',
  'list_agents', 'get_agent_status', 'ack_task', 'admin_update_agent',
  'wait_for_task', 'admin_evict_agent',
  'get_task_context', 'block_task', 'answer_task', 'update_progress',
  'scaffold_plan', 'submit_review', 'broadcast_system_prompt',
  'get_review_comments', 'resolve_review_comment'
] as const;

type ToolName = typeof VALID_TOOLS[number];

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

let server: any;

if (process.env.NODE_ENV !== 'test') {
  server = httpServer.listen(PORT, () => {
    console.log(`WAAAH MCP Server running on port ${PORT}`);
  });
}

export { app, server, io };

// Graceful Shutdown
const shutdown = () => {
  console.log('Shutting down WAAAH MCP Server...');
  if (server) server.close();
  queue.stopScheduler();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (server) {
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error('   Hint: Another WAAAH server might be running in the background.');
      process.exit(1);
    } else {
      console.error('❌ Server error:', e.message);
    }
  });
}

// Periodic cleanup of offline agents
setInterval(() => {
  const busyAgents = queue.getBusyAgentIds();
  const cutoff = Date.now() - CLEANUP_INTERVAL_MS;
  const all = registry.getAll();
  const protectedAgents = new Set([...busyAgents, ...queue.getWaitingAgents().keys()]);

  for (const a of all) {
    if (a.lastSeen && a.lastSeen < cutoff && !protectedAgents.has(a.id)) {
      emitActivity('AGENT', `Agent ${a.displayName || a.id} disconnected (timeout)`, { agentId: a.id });
    }
  }

  registry.cleanup(CLEANUP_INTERVAL_MS, protectedAgents);
}, CLEANUP_INTERVAL_MS);
