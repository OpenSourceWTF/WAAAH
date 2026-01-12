/**
 * Admin Tasks Route Tests
 * 
 * Tests for /admin/tasks/* endpoints using E2E harness.
 * GUARANTEES: In-memory database, random high port, isolated.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2ETestServer, type E2ETestServer } from './e2e-harness.js';

describe('Admin Tasks Routes', () => {
  let server: E2ETestServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createE2ETestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /admin/enqueue', () => {
    it('enqueues a valid task', async () => {
      const res = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Test task prompt',
          workspaceId: 'OpenSourceWTF/WAAAH',
          priority: 'normal'
        })
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.taskId).toMatch(/^task-/);
    });

    it('rejects missing prompt', async () => {
      const res = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('prompt');
    });

    it('blocks malicious prompts', async () => {
      const res = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'rm -rf /',
          workspaceId: 'OpenSourceWTF/WAAAH'
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('security');
    });

    it('accepts valid source values', async () => {
      const res = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Test from UI',
          workspaceId: 'OpenSourceWTF/WAAAH',
          source: 'UI'
        })
      });

      expect(res.ok).toBe(true);
    });
  });

  describe('GET /admin/tasks', () => {
    it('returns task list', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('supports status filter', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks?status=QUEUED`);
      expect(res.ok).toBe(true);
    });

    it('supports excludeTerminal filter', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks?excludeTerminal=true`);
      expect(res.ok).toBe(true);
    });

    it('supports pagination', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks?limit=10&offset=0`);
      expect(res.ok).toBe(true);
    });

    it('supports search query', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks?q=test`);
      expect(res.ok).toBe(true);
    });
  });

  describe('GET /admin/tasks/:taskId', () => {
    it('returns task by ID', async () => {
      // First create a task
      const createRes = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Get by ID test', workspaceId: 'OpenSourceWTF/WAAAH' })
      });
      const { taskId } = await createRes.json();

      // Then get it
      const res = await fetch(`${baseUrl}/admin/tasks/${taskId}`);
      expect(res.ok).toBe(true);
      const task = await res.json();
      expect(task.id).toBe(taskId);
      expect(task.prompt).toBe('Get by ID test');
    });

    it('returns 404 for unknown task', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks/nonexistent-task-id`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/tasks/:taskId/cancel', () => {
    it('cancels a QUEUED task', async () => {
      // Create task
      const createRes = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Cancel test', workspaceId: 'OpenSourceWTF/WAAAH' })
      });
      const { taskId } = await createRes.json();

      // Cancel it
      const res = await fetch(`${baseUrl}/admin/tasks/${taskId}/cancel`, {
        method: 'POST'
      });
      expect(res.ok).toBe(true);
    });
  });

  describe('POST /admin/tasks/:taskId/retry', () => {
    it('returns error for QUEUED task (not retryable)', async () => {
      // Create task
      const createRes = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Retry test', workspaceId: 'OpenSourceWTF/WAAAH' })
      });
      const { taskId } = await createRes.json();

      // Try to retry (should fail - not in terminal state)
      const res = await fetch(`${baseUrl}/admin/tasks/${taskId}/retry`, {
        method: 'POST'
      });
      // May return 400 if task is not in retryable state
      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/tasks/:taskId/comments', () => {
    it('adds comment to task', async () => {
      // Create task
      const createRes = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Comment test', workspaceId: 'OpenSourceWTF/WAAAH' })
      });
      const { taskId } = await createRes.json();

      // Add comment
      const res = await fetch(`${baseUrl}/admin/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Test comment' })
      });
      expect(res.ok).toBe(true);
    });

    it('rejects missing comment content', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks/any-task/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
    });

    it('rejects too many images', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks/any-task/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Test',
          images: ['1', '2', '3', '4', '5', '6'] // Max is 5
        })
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/tasks/:taskId/unblock', () => {
    it('rejects missing reason', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks/any-task/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Reason');
    });

    it('returns 404 for unknown task', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks/nonexistent/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Test reason' })
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /admin/tasks/:taskId/diff', () => {
    it('returns 404 when no worktree exists', async () => {
      // Create task
      const createRes = await fetch(`${baseUrl}/admin/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Diff test', workspaceId: 'OpenSourceWTF/WAAAH' })
      });
      const { taskId } = await createRes.json();

      // Get diff (should 404 - no worktree)
      const res = await fetch(`${baseUrl}/admin/tasks/${taskId}/diff`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /admin/tasks/history (deprecated)', () => {
    it('redirects to /admin/tasks', async () => {
      const res = await fetch(`${baseUrl}/admin/tasks/history`, {
        redirect: 'manual' // Don't follow redirect
      });
      expect(res.status).toBe(301);
    });
  });
});
