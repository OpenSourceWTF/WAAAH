import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app, server } from '../src/server';

const TEST_API_KEY = 'test-api-key-12345';

// Mock the queue to isolate API testing
vi.mock('../src/state/queue.js', () => {
  return {
    TaskQueue: vi.fn().mockImplementation(function () {
      return {
        getAll: vi.fn().mockReturnValue([]),
        getTaskHistory: vi.fn(),
        getTask: vi.fn((id) => {
          if (id === 'task-stuck') return { id: 'task-stuck', status: 'IN_PROGRESS', assignedTo: 'agent-1' };
          if (id === 'task-completed') return { id: 'task-completed', status: 'COMPLETED' };
          return undefined;
        }),
        getTaskFromDB: vi.fn(),
        forceRetry: vi.fn((id) => {
          if (id === 'task-stuck') return { success: true };
          if (id === 'task-completed') return { success: false, error: 'Task status COMPLETED is not retryable' };
          return { success: false, error: 'Task not found' };
        }),
        // Add other methods called by server.ts if necessary
        on: vi.fn(),
        getBusyAgentIds: vi.fn().mockReturnValue([]),
        startScheduler: vi.fn(),
        stopScheduler: vi.fn(),
        clear: vi.fn()
      };
    })
  };
});

describe('API POST /admin/tasks/:taskId/retry', () => {
  afterEach(() => {
    if (server) server.close();
  });

  it('should force retry a stuck task', async () => {
    const res = await request(app)
      .post('/admin/tasks/task-stuck/retry')
      .set('X-API-Key', TEST_API_KEY)
      .send();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.taskId).toBe('task-stuck');
  });

  it('should reject retry for completed task', async () => {
    const res = await request(app)
      .post('/admin/tasks/task-completed/retry')
      .set('X-API-Key', TEST_API_KEY)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not retryable');
  });

  it('should return 400 for non-existent task', async () => {
    const res = await request(app)
      .post('/admin/tasks/task-unknown/retry')
      .set('X-API-Key', TEST_API_KEY)
      .send();

    expect(res.status).toBe(400); // code uses 400 for errors from forceRetry (Task not found returns success:false)
    expect(res.body.error).toContain('Task not found');
  });

  it('should reject request without API key', async () => {
    const res = await request(app)
      .post('/admin/tasks/task-stuck/retry')
      .send();

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });
});

