/**
 * Main Express server entry point for the WAAAH MCP.
 * Configures middleware, API routes, and tool handling.
 */
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import { ToolHandler } from './mcp/tools.js';
import { scanPrompt, getSecurityContext } from './security/prompt-scanner.js';
import { eventBus, emitActivity, initEventLog } from './state/events.js';
import { createProductionContext } from './state/context.js';
import { AGENT_OFFLINE_THRESHOLD_MS, CLEANUP_INTERVAL_MS } from '@opensourcewtf/waaah-types';
import { determineAgentStatus } from './state/agent-status.js';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

dotenv.config();

const app = express();
const PORT = process.env.WAAAH_PORT || process.env.PORT || 3000;
const API_KEY = process.env.WAAAH_API_KEY;
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

// Create production context with all dependencies
const ctx = createProductionContext();

// Initialize event logging with database from context
initEventLog(ctx.db);

// Use services from context
const { registry, queue } = ctx;
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
    to: { agentId },
    priority: priority || 'normal',
    status: 'QUEUED',
    createdAt: Date.now(),
    context: {
      security: getSecurityContext(WORKSPACE_ROOT)
    }
  });

  res.json({ success: true, taskId });
});

/**
 * GET /admin/tasks
 * Retrieves tasks with optional filtering.
 * All tasks are now DB-backed, so this replaces both the old /admin/tasks and /admin/tasks/history.
 * 
 * @query status - Filter by status (single or comma-separated, e.g., 'QUEUED,ASSIGNED')
 * @query agentId - Filter by assigned agent
 * @query limit - Max results (default 50)
 * @query offset - Pagination offset (default 0)
 * @query q - Fuzzy search term
 * @query active - If 'true', only return active (non-terminal) tasks (backward compatibility)
 */
app.get('/admin/tasks', (req, res) => {
  const { status, agentId, limit, offset, q, active } = req.query;

  // Backward compatibility: if active=true, only return non-terminal tasks
  if (active === 'true') {
    const allTasks = queue.getAll();
    const activeTasks = allTasks.filter(t => !['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(t.status));
    res.json(activeTasks);
    return;
  }

  // Default: return filtered tasks from database
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
 * @deprecated Use /admin/tasks with query params instead
 * Kept for backward compatibility, redirects to consolidated endpoint.
 */
app.get('/admin/tasks/history', (req, res) => {
  // Redirect to the main tasks endpoint with the same query params
  const queryStr = req.url.includes('?') ? req.url.split('?')[1] : '';
  res.redirect(301, `/admin/tasks${queryStr ? '?' + queryStr : ''}`);
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
app.post('/admin/tasks/:taskId/cancel', async (req, res) => {
  const { taskId } = req.params;
  const result = queue.cancelTask(taskId);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  // Implicit Cleanup: Remove worktree and branch
  const branchName = `feature-${taskId}`;
  const worktreePath = path.join(WORKSPACE_ROOT, '.worktrees', branchName);

  try {
    console.log(`[Cancel] Cleaning up worktree for task ${taskId}...`);
    await execAsync(`git worktree remove ${worktreePath} --force`, { cwd: WORKSPACE_ROOT }).catch(() => { });
    await execAsync(`git branch -D ${branchName}`, { cwd: WORKSPACE_ROOT }).catch(() => { });
  } catch (e) {
    console.warn(`[Cancel] Cleanup warning for ${taskId}:`, e);
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

// Add comment to a task (mailbox feature - starts unread for agent pickup)
app.post('/admin/tasks/:taskId/comments', (req, res) => {
  const { taskId } = req.params;
  const { content, replyTo, images } = req.body;

  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'Missing or invalid comment content' });
    return;
  }

  // Validate images if provided
  if (images) {
    if (!Array.isArray(images) || images.length > 5) {
      res.status(400).json({ error: 'Images must be an array with max 5 items' });
      return;
    }
  }

  try {
    queue.addUserComment(taskId, content, replyTo, images);
    console.log(`[API] User comment added to task ${taskId} (unread)${replyTo ? ` replying to ${replyTo}` : ''}${images?.length ? ` with ${images.length} images` : ''}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error(`Failed to add comment to task ${taskId}:`, e.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});




// Review System Endpoints

// GET Diff
app.get('/admin/tasks/:taskId/diff', async (req, res) => {
  const { taskId } = req.params;
  const branchName = `feature-${taskId}`;

  try {
    // Diff between main and the feature branch
    const { stdout } = await execAsync(`git diff main...${branchName}`, { cwd: WORKSPACE_ROOT });
    res.json({ diff: stdout });
  } catch (e: any) {
    console.error(`Diff failed for ${taskId}:`, e.message);
    res.status(500).json({ error: 'Failed to fetch diff', details: e.message });
  }
});

// POST Approve - Server only updates status; agent performs merge
app.post('/admin/tasks/:taskId/approve', async (req, res) => {
  const { taskId } = req.params;

  try {
    console.log(`[Review] Approving task ${taskId}...`);

    const task = queue.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    // Add approval comment
    queue.addMessage(taskId, 'system', 'Task approved. Agent should merge to main and cleanup.');

    // Transition to APPROVED - agent will handle merge and mark COMPLETED
    queue.updateStatus(taskId, 'APPROVED');

    res.json({ success: true, message: 'Task approved. Awaiting agent merge.' });
  } catch (e: any) {
    console.error(`Approve failed for ${taskId}:`, e.message);
    res.status(500).json({ error: 'Failed to approve task', details: e.message });
  }
});

// POST Reject - feedback is now optional (comments serve as feedback)
app.post('/admin/tasks/:taskId/reject', async (req, res) => {
  const { taskId } = req.params;
  const { feedback } = req.body;

  try {
    console.log(`[Review] Rejecting task ${taskId}...`);

    // Add rejection summary if provided
    if (feedback) {
      queue.addMessage(taskId, 'user', `Task Rejected: ${feedback}`);
    } else {
      queue.addMessage(taskId, 'system', 'Task rejected. See review comments for details.');
    }

    // Update Status -> IN_PROGRESS (Allows Agent to Resume)
    // Do NOT delete worktree - Agent will resume work there
    queue.updateStatus(taskId, 'IN_PROGRESS');

    res.json({ success: true, message: 'Task rejected and returned to agent' });
  } catch (e: any) {
    console.error(`Reject failed for ${taskId}:`, e.message);
    res.status(500).json({ error: 'Failed to reject task', details: e.message });
  }
});

// ===== Review Comments API =====

// GET Review Comments for a task
app.get('/admin/tasks/:taskId/review-comments', async (req, res) => {
  const { taskId } = req.params;

  try {
    const comments = ctx.db.prepare(`
      SELECT * FROM review_comments 
      WHERE taskId = ? 
      ORDER BY createdAt ASC
    `).all(taskId);

    res.json(comments);
  } catch (e: any) {
    console.error(`Failed to get review comments for ${taskId}:`, e.message);
    res.status(500).json({ error: 'Failed to get review comments', details: e.message });
  }
});

// POST Add Review Comment
app.post('/admin/tasks/:taskId/review-comments', async (req, res) => {
  const { taskId } = req.params;
  const { filePath, lineNumber, content, threadId } = req.body;

  if (!filePath || !content) {
    res.status(400).json({ error: 'filePath and content are required' });
    return;
  }

  try {
    const id = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    ctx.db.prepare(`
      INSERT INTO review_comments (id, taskId, filePath, lineNumber, content, authorRole, authorId, threadId, resolved, createdAt)
      VALUES (?, ?, ?, ?, ?, 'user', 'dashboard', ?, 0, ?)
    `).run(id, taskId, filePath, lineNumber || null, content, threadId || null, Date.now());

    console.log(`[Review] Added comment ${id} on ${filePath}:${lineNumber || 'file'}`);

    res.json({ success: true, id });
  } catch (e: any) {
    console.error(`Failed to add review comment:`, e.message);
    res.status(500).json({ error: 'Failed to add review comment', details: e.message });
  }
});

// POST Resolve Review Comment
app.post('/admin/tasks/:taskId/review-comments/:commentId/resolve', async (req, res) => {
  const { taskId, commentId } = req.params;
  const { response } = req.body;

  try {
    // Mark comment as resolved
    ctx.db.prepare(`
      UPDATE review_comments 
      SET resolved = 1, resolvedBy = 'agent'
      WHERE id = ? AND taskId = ?
    `).run(commentId, taskId);

    // If agent provided a response, add it as a reply
    if (response) {
      const replyId = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const parentComment = ctx.db.prepare('SELECT filePath, lineNumber FROM review_comments WHERE id = ?').get(commentId) as any;

      if (parentComment) {
        ctx.db.prepare(`
          INSERT INTO review_comments (id, taskId, filePath, lineNumber, content, authorRole, authorId, threadId, resolved, createdAt)
          VALUES (?, ?, ?, ?, ?, 'agent', 'agent', ?, 1, ?)
        `).run(replyId, taskId, parentComment.filePath, parentComment.lineNumber, response, commentId, Date.now());
      }
    }

    console.log(`[Review] Resolved comment ${commentId}`);
    res.json({ success: true });
  } catch (e: any) {
    console.error(`Failed to resolve comment:`, e.message);
    res.status(500).json({ error: 'Failed to resolve review comment', details: e.message });
  }
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

// Get all agents with their connection status (full metadata for Dashboard)
app.get('/admin/agents/status', async (req, res) => {
  const agents = registry.getAll();
  const waitingAgents = queue.getWaitingAgents();

  const result = agents.map(agent => {
    const assignedTasks = queue.getAssignedTasksForAgent(agent.id);
    const lastSeen = registry.getLastSeen(agent.id);
    const isRecent = Boolean(lastSeen && (Date.now() - lastSeen) < AGENT_OFFLINE_THRESHOLD_MS);
    const isWaiting = waitingAgents.has(agent.id);
    const status = determineAgentStatus(assignedTasks, isWaiting, isRecent);

    return {
      id: agent.id,
      displayName: agent.displayName,
      status,
      lastSeen,
      currentTasks: assignedTasks.map(t => t.id),
      // Extended metadata for expandable agent cards
      capabilities: agent.capabilities || [],
      color: agent.color
    };
  });

  res.json(result);
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
  'wait_for_task', 'admin_evict_agent',
  'get_task_context', 'block_task', 'answer_task', 'update_progress',
  'scaffold_plan', 'submit_review', 'broadcast_system_prompt',
  'get_review_comments', 'resolve_review_comment'
] as const;

type ToolName = typeof VALID_TOOLS[number];

app.post('/mcp/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  if (toolName !== 'wait_for_prompt' && toolName !== 'get_agent_status' && toolName !== 'list_connected_agents' && toolName !== 'wait_for_task') {
    console.log(`[RPC] Call ${toolName}`);
  }

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

  // Some tools need db access (review comment tools)
  const dbDependentTools = ['get_review_comments', 'resolve_review_comment'];
  const result = dbDependentTools.includes(toolName)
    ? await (method as any).call(tools, args, ctx.db)
    : await (method as any).call(tools, args);
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
setInterval(() => {
  // Prevent cleaning up agents that are currently assigned tasks
  const busyAgents = queue.getBusyAgentIds();

  // Cleanup disconnected agents first
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
