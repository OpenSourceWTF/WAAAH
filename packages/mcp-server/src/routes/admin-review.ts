/**
 * Admin Review Routes
 * Handles all review-related endpoints (diff, approve, reject, review comments)
 */
import { Router } from 'express';
import { TaskQueue } from '../state/queue.js';
import { exec } from 'child_process';
import util from 'util';
import type { Database } from 'better-sqlite3';

const execAsync = util.promisify(exec);

interface ReviewRoutesConfig {
  queue: TaskQueue;
  db: Database;
  workspaceRoot: string;
}

export function createReviewRoutes({ queue, db, workspaceRoot }: ReviewRoutesConfig): Router {
  const router = Router();

  /**
   * GET /tasks/:taskId/diff
   * Returns stored diff from task artifacts if available, otherwise falls back to git diff
   */
  router.get('/tasks/:taskId/diff', async (req, res) => {
    const { taskId } = req.params;

    try {
      // First, check for stored diff in task response
      const task = queue.getTask(taskId);
      if (task?.response) {
        try {
          const response = typeof task.response === 'string'
            ? JSON.parse(task.response)
            : task.response;

          // Check if diff is stored in artifacts
          if (response?.artifacts?.diff) {
            res.json({ diff: response.artifacts.diff, source: 'stored' });
            return;
          }
        } catch {
          // Response parsing failed, fall through to git diff
        }
      }

      // Fallback: Try to get diff from git branch
      const branchName = `feature-${taskId}`;
      const { stdout } = await execAsync(`git diff main...${branchName}`, { cwd: workspaceRoot });
      res.json({ diff: stdout, source: 'git' });
    } catch (e: any) {
      // Return empty diff gracefully (branch may not exist for retried tasks)
      console.log(`[Diff] No diff available for ${taskId}: ${e.message}`);
      res.json({ diff: '', source: 'none' });
    }
  });

  /**
   * POST /tasks/:taskId/approve
   */
  router.post('/tasks/:taskId/approve', async (req, res) => {
    const { taskId } = req.params;

    try {
      console.log(`[Review] Approving task ${taskId}...`);

      const task = queue.getTask(taskId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      queue.addMessage(taskId, 'system', 'Task approved. Queued for agent to merge and cleanup.');
      queue.updateStatus(taskId, 'APPROVED_QUEUED');

      res.json({ success: true, message: 'Task approved and queued for merge.' });
    } catch (e: any) {
      console.error(`Approve failed for ${taskId}:`, e.message);
      res.status(500).json({ error: 'Failed to approve task', details: e.message });
    }
  });

  /**
   * POST /tasks/:taskId/reject
   */
  router.post('/tasks/:taskId/reject', async (req, res) => {
    const { taskId } = req.params;
    const { feedback } = req.body;

    try {
      console.log(`[Review] Rejecting task ${taskId}...`);

      if (feedback) {
        queue.addMessage(taskId, 'user', `Task Rejected: ${feedback}`);
      } else {
        queue.addMessage(taskId, 'system', 'Task rejected. See review comments for details.');
      }

      // Set to REJECTED for audit trail, then immediately to QUEUED for restart
      queue.updateStatus(taskId, 'REJECTED');
      queue.updateStatus(taskId, 'QUEUED');

      res.json({ success: true, message: 'Task rejected and returned to queue' });
    } catch (e: any) {
      console.error(`Reject failed for ${taskId}:`, e.message);
      res.status(500).json({ error: 'Failed to reject task', details: e.message });
    }
  });

  /**
   * GET /tasks/:taskId/review-comments
   */
  router.get('/tasks/:taskId/review-comments', async (req, res) => {
    const { taskId } = req.params;

    try {
      const comments = db.prepare(`
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

  /**
   * POST /tasks/:taskId/review-comments
   */
  router.post('/tasks/:taskId/review-comments', async (req, res) => {
    const { taskId } = req.params;
    const { filePath, lineNumber, content, threadId } = req.body;

    if (!filePath || !content) {
      res.status(400).json({ error: 'filePath and content are required' });
      return;
    }

    try {
      const id = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      db.prepare(`
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

  /**
   * POST /tasks/:taskId/review-comments/:commentId/resolve
   */
  router.post('/tasks/:taskId/review-comments/:commentId/resolve', async (req, res) => {
    const { taskId, commentId } = req.params;
    const { response } = req.body;

    try {
      db.prepare(`
        UPDATE review_comments 
        SET resolved = 1, resolvedBy = 'agent'
        WHERE id = ? AND taskId = ?
      `).run(commentId, taskId);

      if (response) {
        const replyId = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const parentComment = db.prepare('SELECT filePath, lineNumber FROM review_comments WHERE id = ?').get(commentId) as any;

        if (parentComment) {
          db.prepare(`
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

  return router;
}
