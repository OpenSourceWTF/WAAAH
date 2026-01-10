import request from 'supertest';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import path from 'path';

const TEST_API_KEY = 'test-api-key-12345';
const PROJECT_ROOT = path.resolve(process.cwd(), '../..');

// Mock dependencies
vi.mock('../src/state/queue.js', () => {
  return {
    TaskQueue: vi.fn().mockImplementation(function () {
      return {
        startScheduler: vi.fn(),
        stopScheduler: vi.fn(),
        getAll: vi.fn().mockReturnValue([]),
        getTaskHistory: vi.fn().mockReturnValue([]),
        on: vi.fn(),
        off: vi.fn(),
        getBusyAgentIds: vi.fn().mockReturnValue([]),
        getWaitingAgents: vi.fn().mockReturnValue([]),
        getTask: vi.fn(),
        getTaskFromDB: vi.fn()
      }
    })
  }
});

vi.mock('../src/state/registry.js', () => {
  return {
    AgentRegistry: vi.fn().mockImplementation(function () {
      return {
        getAll: vi.fn().mockReturnValue([]),
        cleanup: vi.fn(),
        requestEviction: vi.fn()
      }
    })
  }
});

describe('SPA Routing Integration', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    process.env.WORKSPACE_ROOT = PROJECT_ROOT;
    // Dynamic import to ensure env var is set before module load
    const mod = await import('../src/server');
    app = mod.app;
    server = mod.server;
  });

  afterEach(() => {
    if (server) server.close();
  });

  it('should serve API response for /admin/tasks with API key', async () => {
    const res = await request(app)
      .get('/admin/tasks')
      .set('X-API-Key', TEST_API_KEY);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should reject /admin/tasks without API key', async () => {
    const res = await request(app).get('/admin/tasks');
    expect(res.status).toBe(401);
  });

  it('should serve HTML for SPA routes like /admin/dashboard', async () => {
    const res = await request(app).get('/admin/dashboard');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('should serve index.html for /admin/ (handled by express.static)', async () => {
    const res = await request(app).get('/admin/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

