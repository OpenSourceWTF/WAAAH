import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { AgentRegistry } from './state/registry.js';
import { TaskQueue } from './state/queue.js';
import { ToolHandler } from './mcp/tools.js';
import { scanPrompt, getSecurityContext } from './security/prompt-scanner.js';
import { eventBus } from './state/events.js';

dotenv.config();

const app = express();
const PORT = process.env.WAAAH_PORT || process.env.PORT || 3000;
const API_KEY = process.env.WAAAH_API_KEY;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

const registry = new AgentRegistry();
const queue = new TaskQueue();
const tools = new ToolHandler(registry, queue);

// Middleware
app.use(cors());
app.use(bodyParser.json());

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

// Health check (unauthenticated)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/debug/state', (req, res) => {
  res.json({
    agents: registry.getAll(),
    tasks: queue.getAll().map(t => ({ id: t.id, status: t.status, to: t.to }))
  });
});

// Admin endpoint to enqueue tasks
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

// Query task history from database (includes COMPLETED/FAILED)
app.get('/admin/tasks/history', (req, res) => {
  const { status, agentId, limit, offset } = req.query;
  const tasks = queue.getTaskHistory({
    status: status as string,
    agentId: agentId as string,
    limit: limit ? parseInt(limit as string, 10) : 50,
    offset: offset ? parseInt(offset as string, 10) : 0
  });
  res.json(tasks);
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

// Long-polling endpoint for task completion events
// TODO: Implement proper EventEmitter-based long-polling (see implementation_plan.md)
app.get('/admin/events', async (req, res) => {
  await new Promise(r => setTimeout(r, 5000));
  res.json({ status: 'TIMEOUT' });
});

// SSE stream for real-time delegation notifications
app.get('/admin/delegations/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onDelegation = (task: any) => {
    res.write(`data: ${JSON.stringify(task)}\n\n`);
  };

  eventBus.on('delegation', onDelegation);
  console.log('[SSE] Client connected to delegation stream');

  req.on('close', () => {
    eventBus.off('delegation', onDelegation);
    console.log('[SSE] Client disconnected from delegation stream');
  });
});

app.post('/admin/queue/clear', (req, res) => {
  queue.clear();
  res.json({ success: true, message: 'Queue cleared' });
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

// Tool Routing
app.post('/mcp/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  console.log(`[RPC] Call ${toolName}`);

  let result;
  switch (toolName) {
    case 'register_agent':
      result = await tools.register_agent(args);
      break;
    case 'wait_for_prompt':
      // This will block the HTTP request until timeout or task
      result = await tools.wait_for_prompt(args);
      break;
    case 'send_response':
      result = await tools.send_response(args);
      break;
    case 'assign_task':
      result = await tools.assign_task(args);
      break;
    case 'list_agents':
      result = await tools.list_agents(args);
      break;
    case 'get_agent_status':
      result = await tools.get_agent_status(args);
      break;
    case 'ack_task':
      result = await tools.ack_task(args);
      break;
    case 'admin_update_agent':
      result = await tools.admin_update_agent(args);
      break;
    case 'list_connected_agents':
      result = await tools.list_connected_agents(args);
      break;
    default:
      res.status(404).json({ error: `Tool ${toolName} not found` });
      return;
  }

  res.json(result);
});

const server = app.listen(PORT, () => {
  console.log(`WAAAH MCP Server running on port ${PORT}`);
});

server.on('error', (e: any) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error('   Hint: Another WAAAH server might be running in the background.');
    process.exit(1);
  } else {
    console.error('❌ Server error:', e.message);
  }
});

// Periodic cleanup of offline agents (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  registry.cleanup(CLEANUP_INTERVAL_MS);
}, CLEANUP_INTERVAL_MS);
