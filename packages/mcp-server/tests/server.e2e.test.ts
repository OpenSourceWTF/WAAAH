/**
 * E2E Tests for Server Core Functionality
 * 
 * Tests the core WAAAH server endpoints using an isolated test server.
 * 
 * Uses the E2E test harness which GUARANTEES:
 * - In-memory database (NEVER touches production)
 * - Random high port (30000-40000)
 * - Complete isolation between test runs
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2ETestServer, type E2ETestServer } from './e2e-harness.js';

describe('Server E2E', () => {
  let server: E2ETestServer;
  let BASE_URL: string;

  beforeAll(async () => {
    server = await createE2ETestServer();
    BASE_URL = server.baseUrl;
  });

  afterAll(async () => {
    await server?.close();
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const res = await fetch(`${BASE_URL}/health`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('e2e-test');
    });
  });

  describe('Task Lifecycle', () => {
    it('should create a task via assign_task', async () => {
      const assignRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'assign_task',
            arguments: {
              prompt: 'E2E Test: Create a simple task',
              workspaceId: 'OpenSourceWTF/WAAAH',
              context: { test: true }
            }
          },
          id: 1
        })
      });

      expect(assignRes.ok).toBe(true);
      const assignData = await assignRes.json();
      const taskId = assignData.result?.content?.[0]?.text?.match(/task-\S+/)?.[0];
      expect(taskId).toBeDefined();

      // Verify task appears in the system
      const tasksRes = await fetch(`${BASE_URL}/admin/tasks?active=true`);
      expect(tasksRes.ok).toBe(true);
      const tasks = await tasksRes.json();
      expect(tasks.some((t: any) => t.id === taskId)).toBe(true);
    });

    it('should update task status via send_response', async () => {
      // Create task
      const assignRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'assign_task',
            arguments: {
              prompt: 'E2E Test: Task for status update',
              workspaceId: 'OpenSourceWTF/WAAAH',
              context: { test: true }
            }
          },
          id: 1
        })
      });

      const assignData = await assignRes.json();
      const taskId = assignData.result?.content?.[0]?.text?.match(/task-\S+/)?.[0];

      // Send response
      const responseRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'send_response',
            arguments: {
              taskId,
              status: 'IN_REVIEW',
              message: 'E2E Test: Implementation complete',
              artifacts: ['file1.ts', 'file2.ts'],
              diff: 'diff --git a/file1.ts b/file1.ts\n+// E2E test diff content'
            }
          },
          id: 2
        })
      });

      expect(responseRes.ok).toBe(true);

      // Verify status update
      const taskRes = await fetch(`${BASE_URL}/admin/tasks/${taskId}`);
      expect(taskRes.ok).toBe(true);
      const task = await taskRes.json();
      expect(task.status).toBe('IN_REVIEW');
    });
  });

  describe('Stats and Logs', () => {
    it('should return stats', async () => {
      const res = await fetch(`${BASE_URL}/admin/stats`);
      expect(res.ok).toBe(true);
      const stats = await res.json();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('completed');
    });

    it('should return logs', async () => {
      const res = await fetch(`${BASE_URL}/admin/logs`);
      expect(res.ok).toBe(true);
      const logs = await res.json();
      expect(Array.isArray(logs)).toBe(true);
    });
  });
});
