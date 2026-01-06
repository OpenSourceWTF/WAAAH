import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { AgentRegistry } from './state/registry.js';
import { TaskQueue } from './state/queue.js';
import { ToolHandler } from './mcp/tools.js';

dotenv.config();

const app = express();
const PORT = process.env.WAAAH_PORT || process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// State
const registry = new AgentRegistry();
const queue = new TaskQueue();
const tools = new ToolHandler(registry, queue);

// Debug endpoint
app.get('/debug/state', (req, res) => {
  res.json({
    agents: registry.getAll(),
    connectedAgents: queue.getConnectedAgents(),
    tasks: queue.getAllTasks().map(t => ({ id: t.id, status: t.status, to: t.to }))
  });
});

// Admin endpoint to enqueue tasks (simulating Discord bot for now)
app.post('/admin/enqueue', (req, res) => {
  const { prompt, agentId, role, priority } = req.body;

  const threadId = Math.random().toString(36).substring(7);
  const taskId = `task-${Date.now()}-${threadId}`;

  queue.enqueue({
    id: taskId,
    command: 'execute_prompt',
    prompt,
    from: { type: 'user', id: 'admin', name: 'AdminUser' },
    to: { agentId, role: role || 'developer' }, // Default role
    priority: priority || 'normal',
    status: 'QUEUED',
    createdAt: Date.now()
  });

  res.json({ success: true, taskId });
});

app.get('/admin/tasks', (req, res) => {
  res.json(queue.getAllTasks());
});

app.get('/admin/tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = queue.getTask(taskId);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json(task);
});

// Long-polling endpoint for administrative events (CLI, etc.)
app.get('/admin/events', async (req, res) => {
  console.log('[Events] Admin listener connected');
  const task = await queue.waitForEvent(45000); // 45s timeout

  if (!task) {
    res.json({ status: 'TIMEOUT' });
    return;
  }

  res.json({
    type: 'task_update',
    task: {
      id: task.id,
      status: task.status,
      prompt: task.prompt,
      to: task.to,
      response: task.response
    }
  });
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
