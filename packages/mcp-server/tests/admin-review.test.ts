/**
 * Admin Review Routes Tests
 * 
 * E2E tests for review endpoints (diff, approve, reject, review comments).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createReviewRoutes } from '../src/routes/admin-review.js';

describe('Admin Review Routes', () => {
  let app: express.Express;
  let db: Database.Database;
  let mockQueue: any;

  beforeEach(() => {
    // Use in-memory database
    db = new Database(':memory:');

    // Create required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_comments (
        id TEXT PRIMARY KEY,
        taskId TEXT,
        filePath TEXT,
        lineNumber INTEGER,
        content TEXT,
        authorRole TEXT,
        authorId TEXT,
        threadId TEXT,
        resolved INTEGER DEFAULT 0,
        resolvedBy TEXT,
        createdAt INTEGER
      );
    `);

    mockQueue = {
      getTask: (id: string) => {
        if (id === 'task-with-diff') {
          return { id, response: { artifacts: { diff: 'stored-diff-content' } } };
        }
        if (id === 'existing-task') {
          return { id, status: 'IN_REVIEW' };
        }
        return undefined;
      },
      addMessage: () => { },
      updateStatus: () => { }
    };

    app = express();
    app.use(express.json());
    app.use('/admin', createReviewRoutes({
      queue: mockQueue,
      db,
      workspaceRoot: '/tmp'
    }));
  });

  afterEach(() => {
    db.close();
  });

  describe('GET /admin/tasks/:taskId/diff', () => {
    it('returns stored diff from task artifacts', async () => {
      const res = await request(app)
        .get('/admin/tasks/task-with-diff/diff')
        .expect(200);

      expect(res.body.diff).toBe('stored-diff-content');
      expect(res.body.source).toBe('stored');
    });

    it('returns empty diff for task without diff', async () => {
      const res = await request(app)
        .get('/admin/tasks/nonexistent/diff')
        .expect(200);

      expect(res.body.diff).toBe('');
      expect(res.body.source).toBe('none');
    });
  });

  describe('POST /admin/tasks/:taskId/approve', () => {
    it('approves existing task', async () => {
      const res = await request(app)
        .post('/admin/tasks/existing-task/approve')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('approved');
    });

    it('returns 404 for non-existent task', async () => {
      const res = await request(app)
        .post('/admin/tasks/nonexistent/approve')
        .expect(404);

      expect(res.body.error).toBe('Task not found');
    });
  });

  describe('POST /admin/tasks/:taskId/reject', () => {
    it('rejects task with feedback', async () => {
      const res = await request(app)
        .post('/admin/tasks/existing-task/reject')
        .send({ feedback: 'Please fix tests' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('rejected');
    });

    it('rejects task without feedback', async () => {
      const res = await request(app)
        .post('/admin/tasks/existing-task/reject')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /admin/tasks/:taskId/review-comments', () => {
    it('returns empty array when no comments', async () => {
      const res = await request(app)
        .get('/admin/tasks/task-1/review-comments')
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('returns existing comments', async () => {
      // Insert a comment
      db.prepare(`
        INSERT INTO review_comments (id, taskId, filePath, lineNumber, content, authorRole, authorId, resolved, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('c1', 'task-1', 'src/file.ts', 10, 'Fix this', 'user', 'dashboard', 0, Date.now());

      const res = await request(app)
        .get('/admin/tasks/task-1/review-comments')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].content).toBe('Fix this');
    });
  });

  describe('POST /admin/tasks/:taskId/review-comments', () => {
    it('creates a review comment', async () => {
      const res = await request(app)
        .post('/admin/tasks/task-1/review-comments')
        .send({ filePath: 'src/file.ts', lineNumber: 10, content: 'Please review' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 when filePath missing', async () => {
      const res = await request(app)
        .post('/admin/tasks/task-1/review-comments')
        .send({ content: 'Comment without file' })
        .expect(400);

      expect(res.body.error).toContain('filePath and content are required');
    });

    it('returns 400 when content missing', async () => {
      const res = await request(app)
        .post('/admin/tasks/task-1/review-comments')
        .send({ filePath: 'src/file.ts' })
        .expect(400);

      expect(res.body.error).toContain('required');
    });
  });

  describe('POST /admin/tasks/:taskId/review-comments/:commentId/resolve', () => {
    it('resolves a comment', async () => {
      // Insert a comment first
      db.prepare(`
        INSERT INTO review_comments (id, taskId, filePath, lineNumber, content, authorRole, authorId, resolved, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('c1', 'task-1', 'src/file.ts', 10, 'Fix this', 'user', 'dashboard', 0, Date.now());

      const res = await request(app)
        .post('/admin/tasks/task-1/review-comments/c1/resolve')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('resolves with agent response', async () => {
      db.prepare(`
        INSERT INTO review_comments (id, taskId, filePath, lineNumber, content, authorRole, authorId, resolved, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('c2', 'task-1', 'src/file.ts', 15, 'Add tests', 'user', 'dashboard', 0, Date.now());

      const res = await request(app)
        .post('/admin/tasks/task-1/review-comments/c2/resolve')
        .send({ response: 'Added tests in file.test.ts' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
