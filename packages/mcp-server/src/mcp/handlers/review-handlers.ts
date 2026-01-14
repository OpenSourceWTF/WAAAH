/**
 * Review-related tool handlers
 * Extracted from ToolHandler for better separation of concerns
 */
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { TaskQueue } from '../../state/queue.js';
import { submitReviewSchema, scaffoldPlanSchema, toMCPError } from '@opensourcewtf/waaah-types';

const execAsync = util.promisify(exec);

export class ReviewHandlers {
  constructor(private queue: TaskQueue) { }

  private handleError(error: unknown) {
    console.error('[ToolError]', error);
    return toMCPError(error);
  }

  /**
   * Generates a standard implementation plan template.
   */
  async scaffold_plan(args: unknown) {
    try {
      const params = scaffoldPlanSchema.parse(args);
      const template = `# Implementation Plan - ${params.taskId}

## Goal Description
[Brief description of the goal]

## User Review Required
> [!IMPORTANT]
> [List critical items requiring user attention]

## Proposed Changes
### [Component Name]
#### [MODIFY] [filename]

## Verification Plan
### Automated Tests
- [ ] Command: \`pnpm test\`
- [ ] Unit Test: ...

### Manual Verification
- [ ] Scenario: ...
`;

      return {
        content: [{ type: 'text', text: template }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Submits code for review (Format -> Commit -> Test -> Submit).
   */
  async submit_review(args: unknown) {
    try {
      const params = submitReviewSchema.parse(args);
      const worktreePath = path.resolve(process.cwd(), '.worktrees', `feature-${params.taskId}`);

      if (!fs.existsSync(worktreePath)) {
        return { isError: true, content: [{ type: 'text', text: `Worktree for ${params.taskId} not found. Expected at ${worktreePath}` }] };
      }

      console.log(`[Tool] Submitting review for ${params.taskId}`);

      // 1. Format
      console.log('- Formatting...');
      await execAsync('pnpm format', { cwd: worktreePath });

      // 2. Commit
      console.log('- Committing...');
      try {
        await execAsync('git add .', { cwd: worktreePath });
        const status = await execAsync('git status --porcelain', { cwd: worktreePath });
        if (status.stdout.trim()) {
          await execAsync(`git commit -m "${params.message}"`, { cwd: worktreePath });
        } else {
          console.log('  (No changes to commit)');
        }
      } catch (e) {
        console.error('Commit failed:', e);
        throw e;
      }

      // 3. Test
      if (params.runTests) {
        console.log('- Testing...');
        try {
          await execAsync('pnpm test', { cwd: worktreePath });
        } catch (e: unknown) {
          console.error('Tests failed');
          const execError = e as { stdout?: string; stderr?: string };
          return { isError: true, content: [{ type: 'text', text: `TESTS FAILED for ${params.taskId}:\n\n${execError.stdout || ''}\n\n${execError.stderr || ''}\n\nSubmission ABORTED. Please fix tests.` }] };
        }
      }

      // 4. Push
      console.log('- Pushing...');
      const branchName = `feature/${params.taskId}`;
      await execAsync(`git push origin ${branchName}`, { cwd: worktreePath });

      // 5. Update Status
      console.log('- Updating Status...');
      this.queue.updateStatus(params.taskId, 'IN_REVIEW');

      return {
        content: [{ type: 'text', text: `Success: Task ${params.taskId} submitted for review on branch ${branchName}.` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Gets review comments for a task (for code review workflow).
   */
  async get_review_comments(args: unknown, db: import('better-sqlite3').Database) {
    try {
      const { getReviewCommentsSchema } = await import('@opensourcewtf/waaah-types');
      const params = getReviewCommentsSchema.parse(args);

      let query = 'SELECT * FROM review_comments WHERE taskId = ?';
      if (params.unresolvedOnly !== false) {
        query += ' AND resolved = 0 AND threadId IS NULL';
      }
      query += ' ORDER BY createdAt ASC';

      const comments = db.prepare(query).all(params.taskId);

      console.log(`[Tool] Retrieved ${comments.length} review comments for task ${params.taskId}`);

      return {
        content: [{ type: 'text', text: JSON.stringify(comments) }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Resolves a review comment (marks it as addressed).
   */
  async resolve_review_comment(args: unknown, db: import('better-sqlite3').Database) {
    try {
      const { resolveReviewCommentSchema } = await import('@opensourcewtf/waaah-types');
      const params = resolveReviewCommentSchema.parse(args);

      db.prepare(`
        UPDATE review_comments 
        SET resolved = 1, resolvedBy = 'agent'
        WHERE id = ? AND taskId = ?
      `).run(params.commentId, params.taskId);

      if (params.response) {
        const replyId = `rc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const parentComment = db.prepare('SELECT filePath, lineNumber FROM review_comments WHERE id = ?').get(params.commentId) as { filePath?: string; lineNumber?: number } | undefined;

        if (parentComment) {
          db.prepare(`
            INSERT INTO review_comments (id, taskId, filePath, lineNumber, content, authorRole, authorId, threadId, resolved, createdAt)
            VALUES (?, ?, ?, ?, ?, 'agent', 'agent', ?, 1, ?)
          `).run(replyId, params.taskId, parentComment.filePath, parentComment.lineNumber, params.response, params.commentId, Date.now());
        }
      }

      console.log(`[Tool] Resolved review comment ${params.commentId}`);

      return {
        content: [{ type: 'text', text: `Comment ${params.commentId} resolved` }]
      };
    } catch (e) { return this.handleError(e); }
  }
}
