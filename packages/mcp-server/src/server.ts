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
import { createTaskRoutes, createReviewRoutes, createAgentRoutes, createSSERoutes } from './routes/index.js';
import { createToolRouter } from './routes/toolRouter.js';
import { startCleanupInterval } from './lifecycle/cleanup.js';
import { getOrCreateApiKey } from './utils/auth.js';
import { applySocketAuth } from './mcp/socket-auth.js';
import { initEventBus } from './state/eventbus.js';
import { SocketService } from './state/socket-service.js';

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

// Apply Socket.io authentication
applySocketAuth(io);

// Initialize EventBus for real-time updates
initEventBus(io);

// Create production context with all dependencies
const ctx = createProductionContext();
initEventLog(ctx.db);

// Use services from context
const { registry, queue } = ctx;
queue.startScheduler();

// Initialize Socket Service
new SocketService(io, registry, queue);

const tools = new ToolHandler(registry, queue);

// Middleware
app.use(cors());
app.use(bodyParser.json());

/**
 * API Key Authentication Middleware
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

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Serve Admin Dashboard static files
app.use('/admin', express.static(path.join(WORKSPACE_ROOT, 'packages/mcp-server/public')));
app.get('/admin/', (_, res) => res.redirect('/admin/index.html'));

// ============================================
// PROTECTED ROUTES (require API key)
// ============================================

app.get('/debug/state', requireApiKey, (_, res) => {
  res.json({
    agents: registry.getAll(),
    tasks: queue.getAll().map(t => ({ id: t.id, status: t.status, to: t.to }))
  });
});

app.get('/admin/stats', requireApiKey, (_, res) => res.json(queue.getStats()));

app.get('/admin/logs', requireApiKey, (_, res) => {
  try {
    res.json(queue.getLogs(100));
  } catch (e) {
    console.error('Failed to fetch logs:', e);
    res.json([]);
  }
});

app.post('/admin/queue/clear', requireApiKey, (_, res) => {
  queue.clear();
  res.json({ success: true, message: 'Queue cleared' });
});

// SPA fallback for client-side routing
const API_PREFIXES = ['/admin/tasks', '/admin/agents', '/admin/stats', '/admin/logs',
  '/admin/enqueue', '/admin/evict', '/admin/delegations', '/admin/bot', '/admin/review',
  '/admin/queue'];

app.get('/admin/*', (req, res, next) => {
  if (API_PREFIXES.some(p => req.path.startsWith(p))) return next();
  res.sendFile(path.join(WORKSPACE_ROOT, 'packages/mcp-server/public/index.html'));
});

// Mount extracted route modules (protected)
const adminApiRouter = express.Router();
adminApiRouter.use(requireApiKey);
adminApiRouter.use(createTaskRoutes({ queue, workspaceRoot: WORKSPACE_ROOT }));
adminApiRouter.use(createReviewRoutes({ queue, db: ctx.db, workspaceRoot: WORKSPACE_ROOT }));
adminApiRouter.use(createAgentRoutes({ registry, queue }));
adminApiRouter.use(createSSERoutes({ queue, registry }));
app.use('/admin', adminApiRouter);

// Tool Routing - use extracted router
const toolRouter = createToolRouter(tools, ctx);
app.use('/mcp/tools', requireApiKey, toolRouter);

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
startCleanupInterval(registry, queue, CLEANUP_INTERVAL_MS);
