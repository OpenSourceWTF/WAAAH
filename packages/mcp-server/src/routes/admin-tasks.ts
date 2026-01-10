/**
 * Admin Task Routes
 * Handles all /admin/tasks/* endpoints
 */
import { Router } from 'express';
import { TaskQueue } from '../state/queue.js';
import { scanPrompt, getSecurityContext } from '../security/prompt-scanner.js';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execAsync = util.promisify(exec);

interface TaskRoutesConfig {
  queue: TaskQueue;
  workspaceRoot: string;
}

export function createTaskRoutes({ queue, workspaceRoot }: TaskRoutesConfig): Router {
  const router = Router();

  /**
   * POST /enqueue
   * Enqueues a new task from the Admin interface.
   */
  router.post('/enqueue', (req, res) => {
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
        security: getSecurityContext(workspaceRoot)
      }
    });

    res.json({ success: true, taskId });
  });

  /**
   * GET /tasks
   * Retrieves tasks with optional filtering.
   */
  router.get('/tasks', (req, res) => {
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

    // Implicit Cleanup: Remove worktree and branch
    const branchName = `feature-${taskId}`;
    const worktreePath = path.join(workspaceRoot, '.worktrees', branchName);

    try {
      console.log(`[Cancel] Cleaning up worktree for task ${taskId}...`);
      await execAsync(`git worktree remove ${worktreePath} --force`, { cwd: workspaceRoot }).catch(() => { });
      await execAsync(`git branch -D ${branchName}`, { cwd: workspaceRoot }).catch(() => { });
    } catch (e) {
      console.warn(`[Cancel] Cleanup warning for ${taskId}:`, e);
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

  return router;
}
