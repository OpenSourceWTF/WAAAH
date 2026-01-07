import request from 'supertest';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd(), '../..');

// Mock Queue and Registry
// detailed mock to handle filtering logic or just use real Queue with mocked DB?
// server.ts imports TaskQueue from ./state/queue.js
// If we want to test filtering logic, we should use the REAL Queue and maybe mock the DB?
// But Queue uses `db` which is imported from `./db.js`.
// Better to mock `TaskQueue` prototype methods if we are testing API routing,
// OR use real Queue and mock DB.
// Let's mock TaskQueue.getTaskHistory to verify arguments passed.

vi.mock('../src/state/queue.js', () => {
  return {
    TaskQueue: vi.fn().mockImplementation(function () {
      return {
        startScheduler: vi.fn(),
        stopScheduler: vi.fn(),
        getAll: vi.fn().mockReturnValue([]),
        on: vi.fn(),
        off: vi.fn(),
        getBusyAgentIds: vi.fn().mockReturnValue([]),
        getTaskHistory: vi.fn().mockImplementation((opts) => {
          // Return what was passed to verify controller logic
          return [{ id: 'mock-task', opts }];
        })
      }
    })
  }
});

vi.mock('../src/state/registry.js', () => {
  return {
    AgentRegistry: vi.fn().mockImplementation(function () {
      return {
        getAll: vi.fn().mockReturnValue([]),
        cleanup: vi.fn()
      }
    })
  }
});

describe('History API Integration', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    process.env.WORKSPACE_ROOT = PROJECT_ROOT;
    const mod = await import('../src/server');
    app = mod.app;
    server = mod.server;
  });

  afterEach(() => {
    if (server) server.close();
  });

  it('should pass search param "q" to generic search', async () => {
    const res = await request(app).get('/admin/tasks/history?q=bug&limit=10');
    expect(res.status).toBe(200);
    const result = res.body[0];
    expect(result.id).toBe('mock-task');
    expect(result.opts.search).toBe('bug');
    expect(result.opts.limit).toBe(10);
  });

  it('should pass status filter', async () => {
    const res = await request(app).get('/admin/tasks/history?status=FAILED');
    expect(res.status).toBe(200);
    const result = res.body[0];
    expect(result.opts.status).toBe('FAILED');
  });
});
