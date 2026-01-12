/**
 * Admin Task Routes
 * Handles all /admin/tasks/* endpoints
 */
import { Router } from 'express';
import { TaskQueue } from '../state/queue.js';
import { scanPrompt, getSecurityContext } from '../security/prompt-scanner.js';
import path from 'path';
import { GitService } from '../services/git-service.js';

interface TaskRoutesConfig {
  queue: TaskQueue;
  workspaceRoot: string;
}

export function createTaskRoutes({ queue, workspaceRoot }: TaskRoutesConfig): Router {
  const router = Router();
  const git = new GitService(workspaceRoot);

  /**
   * POST /enqueue
   * Enqueues a new task from the Admin interface (Dashboard UI).
   *
   * Body: {
   *   prompt: string (required)
   *   title?: string
   *   priority?: 'normal' | 'high' | 'critical'
   *   workspace?: string (maps to to.workspaceId)
   *   requiredCapabilities?: string[]
   *   images?: {dataUrl: string, mimeType: string, name: string}[]
   *   source: 'UI' | 'CLI' | 'Agent'
   * }
   */
  router.post('/enqueue', (req, res) => {
    const { prompt, title, priority, workspace, requiredCapabilities, images, source, agentId } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      res.status(400).json({ error: 'Missing or invalid prompt' });
      return;
    }

    // Validate source if provided
    const validSources = ['UI', 'CLI', 'Agent'] as const;
    const taskSource = validSources.includes(source) ? source : 'CLI'; // Default to CLI for backward compat

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

    // Validate images if provided
    if (images) {
      if (!Array.isArray(images)) {
        res.status(400).json({ error: 'Images must be an array' });
        return;
      }
      for (const img of images) {
        if (!img.dataUrl || !img.mimeType || !img.name) {
          res.status(400).json({ error: 'Each image must have dataUrl, mimeType, and name' });
          return;
        }
      }
    }

    const threadId = Math.random().toString(36).substring(7);
    const taskId = `task-${Date.now()}-${threadId}`;

    // Determine from field based on source
    const fromField = taskSource === 'UI'
      ? { type: 'user' as const, id: 'dashboard', name: 'Dashboard UI' }
      : { type: 'user' as const, id: 'admin', name: 'AdminUser' };

    queue.enqueue({
      id: taskId,
      command: 'execute_prompt',
      prompt,
      title: title || undefined,
      from: fromField,
      to: {
        agentId,
        workspaceId: workspace || undefined,
        requiredCapabilities: requiredCapabilities || undefined
      },
      priority: priority || 'normal',
      status: 'QUEUED',
      createdAt: Date.now(),
      source: taskSource,
      context: {
        security: getSecurityContext(workspaceRoot),
        ...(images && { images })
      }
    });

    res.json({ success: true, taskId });
  });

  /**
   * GET /tasks
   * Unified task retrieval - all queries go through database.
   * 
   * Query params:
   * - status: Filter by specific status (e.g., COMPLETED, CANCELLED)
   * - excludeTerminal=true: Exclude terminal states (COMPLETED, FAILED, BLOCKED, CANCELLED)
   * - q: Search by task ID, title, prompt, or assignedTo
   * - limit/offset: Pagination (default limit=50)
   * - agentId: Filter by assigned agent
   */
  router.get('/tasks', (req, res) => {
    const { status, agentId, limit, offset, q, excludeTerminal, active } = req.query;
    const searchQuery = (q as string)?.trim() || '';

    // Build status filter - support excludeTerminal for active swimlanes
    // Also support legacy 'active=true' as alias for excludeTerminal=true
    let statusFilter = status as string | undefined;
    if ((excludeTerminal === 'true' || active === 'true') && !statusFilter) {
      // Return non-terminal tasks by excluding terminal statuses
      statusFilter = 'ACTIVE'; // Special value handled by queue
    }

    const tasks = queue.getTaskHistory({
      status: statusFilter,
      agentId: agentId as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      search: searchQuery
    });
    res.json(tasks);
  });

  /**
   * @deprecated Use /tasks with query params instead
   */
  router.get('/tasks/history', (req, res) => {
    const queryStr = req.url.includes('?') ? req.url.split('?')[1] : '';
    res.redirect(301, `/admin/tasks${queryStr ? '?' + queryStr : ''}`);
  });

  /**
   * GET /tasks/:taskId
   */
  router.get('/tasks/:taskId', (req, res) => {
    const { taskId } = req.params;
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

  /**
   * POST /tasks/:taskId/cancel
   */
  router.post('/tasks/:taskId/cancel', async (req, res) => {
    const { taskId } = req.params;
    const result = queue.cancelTask(taskId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }



    res.json({ success: true, taskId });
  });

  /**
   * POST /tasks/:taskId/retry
   */
  router.post('/tasks/:taskId/retry', (req, res) => {
    const { taskId } = req.params;
    const result = queue.forceRetry(taskId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, taskId });
  });

  /**
   * GET /tasks/:taskId/diff
   * Returns the git diff for the task's worktree
   */
  router.get('/tasks/:taskId/diff', async (req, res) => {
    const { taskId } = req.params;

    try {
      // S17: Check for persisted raw diff first (supports remote agents)
      const task = queue.getTask(taskId) || queue.getTaskFromDB(taskId);
      if (task?.response && (task.response as any).diff) {
        res.json({ diff: (task.response as any).diff });
        return;
      }

      // Fallback: Use GitService to check local worktree
      const diff = await git.getDiff(taskId);
      if (diff === null) {
        res.status(404).json({ error: 'Worktree not found. Agent may not have created it yet.' });
        return;
      }

      res.json({ diff });
    } catch (e: any) {
      console.error(`[API] Failed to get diff for ${taskId}:`, e.message);
      res.status(500).json({ error: 'Failed to generate diff' });
    }
  });

  /**
   * POST /tasks/:taskId/comments
   * Add comment to a task (mailbox feature)
   */
  router.post('/tasks/:taskId/comments', (req, res) => {
    const { taskId } = req.params;
    const { content, replyTo, images } = req.body;

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Missing or invalid comment content' });
      return;
    }

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

  /**
   * POST /tasks/:taskId/unblock
   * Unblocks a BLOCKED task with a required reason
   */
  router.post('/tasks/:taskId/unblock', (req, res) => {
    const { taskId } = req.params;
    const { reason } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      res.status(400).json({ error: 'Reason is required when unblocking a task' });
      return;
    }

    let task = queue.getTask(taskId);
    if (!task) {
      task = queue.getTaskFromDB(taskId);
    }
    console.log(`[API] Unblock request: taskId=${taskId}, fromMemory=${!!queue.getTask(taskId)}, fromDB=${!!task}, status=${task?.status}`);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (task.status !== 'BLOCKED') {
      console.log(`[API] Task ${taskId} is not BLOCKED, current status: ${task.status}`);
      res.status(400).json({ error: `Task is not BLOCKED (current status: ${task.status})` });
      return;
    }

    // Add unblock reason as a user comment
    queue.addUserComment(taskId, `[UNBLOCK] ${reason.trim()}`);

    // Requeue the task
    const result = queue.forceRetry(taskId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    console.log(`[API] Task ${taskId} unblocked with reason: ${reason.trim()}`);
    res.json({ success: true, taskId });
  });

  return router;
}
