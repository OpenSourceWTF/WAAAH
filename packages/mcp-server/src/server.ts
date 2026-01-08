/**
 * Main Express server entry point for the WAAAH MCP.
 * Configures middleware, API routes, and tool handling.
 */
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { AgentRegistry } from './state/registry.js';
import { TaskQueue } from './state/queue.js';
import { ToolHandler } from './mcp/tools.js';
import { scanPrompt, getSecurityContext } from './security/prompt-scanner.js';
import { eventBus, emitActivity } from './state/events.js';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.WAAAH_PORT || process.env.PORT || 3000;
const API_KEY = process.env.WAAAH_API_KEY;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

const registry = new AgentRegistry();
const queue = new TaskQueue();
queue.startScheduler();

// Track active bot connections (SSE streams)
let activeDelegationStreams = 0;

const tools = new ToolHandler(registry, queue);

// Middleware
app.use(cors());
app.use(bodyParser.json());
// Serve Admin Dashboard
app.use('/admin', express.static(path.join(WORKSPACE_ROOT, 'packages/mcp-server/public')));
app.use('/admin', (req, res, next) => {
  // Redirect root /admin to /admin/index.html to avoid 404s on directory root
  if (req.path === '/') {
    return res.redirect('/admin/index.html');
  }
  next();
});

// API Key Authentication (if configured)
app.use((req, res, next) => {
  // Skip auth for health check
  if (req.path === '/health') return next();

  // If no API key is configured, allow all (dev mode)
  if (!API_KEY) return next();

  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (providedKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    return;
  }
  next();
});

/**
 * GET /health
 * Simple health check endpoint to verify server responsiveness.
 * @returns { status: 'ok' }
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/debug/state', (req, res) => {
  res.json({
    agents: registry.getAll(),
    tasks: queue.getAll().map(t => ({ id: t.id, status: t.status, to: t.to }))
  });
});

app.get('/admin/stats', (req, res) => {
  res.json(queue.getStats());
});

/**
 * POST /admin/enqueue
 * Enqueues a new task from the Admin interface.
 * Security: Validates prompt for malicious patterns.
 * 
 * @body { prompt, agentId, role, priority }
 * @returns { success: true, taskId: string }
 */
app.post('/admin/enqueue', (req, res) => {
  const { prompt, agentId, role, priority } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'Missing or invalid prompt' });
    return;
  }

  // Security: Scan prompt for attacks
  const scan = scanPrompt(prompt);
  if (!scan.allowed) {
    console.warn(`[Security] Blocked prompt. Flags: ${scan.flags.join(', ')}`);
    res.status(403).json({
      error: 'Prompt blocked by security policy',
      flags: scan.flags
    });
    return;
  }

  const threadId = Math.random().toString(36).substring(7);
  const taskId = `task-${Date.now()}-${threadId}`;

  queue.enqueue({
    id: taskId,
    command: 'execute_prompt',
    prompt,
    from: { type: 'user', id: 'admin', name: 'AdminUser' },
    to: { agentId, role: role || 'developer' },
    priority: priority || 'normal',
    status: 'QUEUED',
    createdAt: Date.now(),
    context: {
      security: getSecurityContext(WORKSPACE_ROOT)
    }
  });

  res.json({ success: true, taskId });
});

app.get('/admin/tasks', (req, res) => {
  res.json(queue.getAll());
});

/**
 * GET /admin/tasks/history
 * Retrieves task history from database with filtering.
 * 
 * @query status - Filter by status (single or comma-separated)
 * @query agentId - Filter by assigned agent
 * @query limit - Max results (default 50)
 * @query offset - Pagination offset (default 0)
 * @query q - Fuzzy search term
 */
app.get('/admin/tasks/history', (req, res) => {
  const { status, agentId, limit, offset, q } = req.query;
  const tasks = queue.getTaskHistory({
    status: status as string,
    agentId: agentId as string,
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0,
    search: q as string
  });
  res.json(tasks);
});

/**
 * GET /admin/stats
 * Retrieves global task statistics.
 */
app.get('/admin/stats', (req, res) => {
  const stats = queue.getStats();
  res.json(stats);
});

/**
 * GET /admin/logs
 * Retrieves recent chronological system activity logs.
 * @returns Array of log objects.
 */
app.get('/admin/logs', (req, res) => {
  try {
    const logs = queue.getLogs(100);
    res.json(logs);
  } catch (e) {
    console.error('Failed to fetch logs:', e);
    res.json([]);
  }
});

app.get('/admin/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  // First check in-memory, then fall back to database
  let task = queue.getTask(taskId);
  if (!task) {
    task = queue.getTaskFromDB(taskId);
  }

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json(task);
});

// Cancel a task
app.post('/admin/tasks/:taskId/cancel', (req, res) => {
  const { taskId } = req.params;
  const result = queue.cancelTask(taskId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true, taskId });
});

// Force retry a task
app.post('/admin/tasks/:taskId/retry', (req, res) => {
  const { taskId } = req.params;
  const result = queue.forceRetry(taskId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  res.json({ success: true, taskId });
});

// Long-polling endpoint for task completion events
// TODO: Implement proper EventEmitter-based long-polling (see implementation_plan.md)
app.get('/admin/events', async (req, res) => {
  await new Promise(r => setTimeout(r, 5000));
  res.json({ status: 'TIMEOUT' });
});

/**
 * GET /admin/delegations/stream
 * Server-Sent Events (SSE) stream for real-time updates.
 * Emits 'delegation', 'completion', and 'activity' events.
 */
app.get('/admin/delegations/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onDelegation = (task: any) => {
    res.write(`data: ${JSON.stringify({ type: 'delegation', payload: task })}\n\n`);
  };

  const onCompletion = (task: any) => {
    res.write(`data: ${JSON.stringify({ type: 'completion', payload: task })}\n\n`);
  };

  const onActivity = (activity: any) => {
    res.write(`data: ${JSON.stringify(activity)}\n\n`);
  };

  eventBus.on('delegation', onDelegation);
  queue.on('completion', onCompletion);
  eventBus.on('activity', onActivity);

  activeDelegationStreams++;
  console.log('[SSE] Client connected to delegation/completion stream. Total:', activeDelegationStreams);

  req.on('close', () => {
    eventBus.off('delegation', onDelegation);
    queue.off('completion', onCompletion);
    eventBus.off('activity', onActivity);
    activeDelegationStreams = Math.max(0, activeDelegationStreams - 1);
    console.log('[SSE] Client disconnected from stream. Total:', activeDelegationStreams);
  });
});

// Get bot connection status
app.get('/admin/bot/status', (req, res) => {
  res.json({
    connected: activeDelegationStreams > 0,
    count: activeDelegationStreams
  });
});

app.post('/admin/queue/clear', (req, res) => {
  queue.clear();
  res.json({ success: true, message: 'Queue cleared' });
});

// Evict an agent
app.post('/admin/evict', (req, res) => {
  const { agentId, reason, action } = req.body;
  if (!agentId || !reason) {
    res.status(400).json({ error: 'Missing agentId or reason' });
    return;
  }
  queue.queueEviction(agentId, reason, action || 'RESTART');
  res.json({ success: true, message: `Eviction queued for ${agentId}` });
});

// Get all agents with their connection status
app.get('/admin/agents/status', async (req, res) => {
  const result = await tools.list_connected_agents({});
  const content = result.content?.[0]?.text;
  if (content) {
    res.json(JSON.parse(content));
  } else {
    res.json([]);
  }
});

app.post('/admin/agents/:agentId/evict', (req, res) => {
  const { agentId } = req.params;
  const { reason } = req.body;

  const success = registry.requestEviction(agentId, reason || 'Admin requested eviction');
  if (success) {
    res.json({ success: true, message: `Eviction requested for ${agentId}` });
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Tool Routing - Dynamic dispatch to ToolHandler methods
const VALID_TOOLS = [
  'register_agent', 'wait_for_prompt', 'send_response', 'assign_task',
  'list_agents', 'get_agent_status', 'ack_task', 'admin_update_agent',
  'list_connected_agents', 'wait_for_task', 'admin_evict_agent'
] as const;

type ToolName = typeof VALID_TOOLS[number];

app.post('/mcp/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  console.log(`[RPC] Call ${toolName}`);

  // Validate tool name
  if (!VALID_TOOLS.includes(toolName as ToolName)) {
    res.status(404).json({ error: `Tool ${toolName} not found` });
    return;
  }

  // Dynamic dispatch to the appropriate method
  const method = tools[toolName as keyof typeof tools];
  if (typeof method !== 'function') {
    res.status(500).json({ error: `Tool ${toolName} not implemented` });
    return;
  }

  const result = await method.call(tools, args);
  res.json(result);
});

// Fallback for SPA routing (must be after all API routes)
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(WORKSPACE_ROOT, 'packages/mcp-server/public/index.html'));
});

let server: any;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`WAAAH MCP Server running on port ${PORT}`);
  });
}

export { app, server };

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

// Periodic cleanup of offline agents (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  // Prevent cleaning up agents that are currently assigned tasks
  const busyAgents = queue.getBusyAgentIds();

  // Cleanup disconnected agents first
  const cutoff = Date.now() - CLEANUP_INTERVAL_MS;
  const all = registry.getAll();

  const protectedAgents = new Set([...busyAgents, ...queue.getWaitingAgents()]);

  for (const a of all) {
    if (a.lastSeen && a.lastSeen < cutoff && !protectedAgents.has(a.id)) {
      emitActivity('AGENT', `Agent ${a.displayName || a.id} disconnected (timeout)`, { agentId: a.id });
    }
  }

  registry.cleanup(CLEANUP_INTERVAL_MS, protectedAgents);
}, CLEANUP_INTERVAL_MS);
