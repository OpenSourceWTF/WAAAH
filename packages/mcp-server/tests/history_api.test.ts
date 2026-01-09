import request from 'supertest';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd(), '../..');

// Mock context.js to use in-memory database with proper queue mock
vi.mock('../src/state/context.js', () => {
  const Database = require('better-sqlite3');

  const createContext = () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, role TEXT, displayName TEXT, capabilities TEXT, lastSeen INTEGER);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, status TEXT, prompt TEXT, createdAt INTEGER);
      CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER, category TEXT, message TEXT, metadata TEXT);
    `);

    return {
      db,
      registry: { getAll: () => [], cleanup: () => { } },
      queue: {
        startScheduler: () => { },
        stopScheduler: () => { },
        getAll: () => [],
        on: () => { },
        off: () => { },
        getBusyAgentIds: () => [],
        getWaitingAgents: () => [],
        // getTaskHistory returns the opts passed to it for test verification
        getTaskHistory: (opts: any) => {
          return [{ id: 'mock-task', opts }];
        }
      },
      close: () => db.close(),
      cleanup: () => db.close(),
      isHealthy: () => true
    };
  };

  return {
    createProductionContext: createContext,
    createTestContext: createContext
  };
});

// Mock events.js to provide initEventLog
vi.mock('../src/state/events.js', () => ({
  eventBus: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  emitActivity: vi.fn(),
  initEventLog: vi.fn()
}));

// Mock ToolHandler to avoid complex init
vi.mock('../src/mcp/tools.js', () => {
  return {
    ToolHandler: vi.fn().mockImplementation(function () {
      return {};
    })
  };
});

describe('Tasks API Integration', () => {
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

  describe('GET /admin/tasks (unified endpoint)', () => {
    it('should pass search param "q" to generic search', async () => {
      const res = await request(app).get('/admin/tasks?q=bug&limit=10');
      expect(res.status).toBe(200);
      const result = res.body[0];
      expect(result.id).toBe('mock-task');
      expect(result.opts.search).toBe('bug');
      expect(result.opts.limit).toBe(10);
    });

    it('should pass status filter', async () => {
      const res = await request(app).get('/admin/tasks?status=FAILED');
      expect(res.status).toBe(200);
      const result = res.body[0];
      expect(result.opts.status).toBe('FAILED');
    });

    it('should pass agentId filter', async () => {
      const res = await request(app).get('/admin/tasks?agentId=agent-123');
      expect(res.status).toBe(200);
      const result = res.body[0];
      expect(result.opts.agentId).toBe('agent-123');
    });

    it('should support pagination with limit and offset', async () => {
      const res = await request(app).get('/admin/tasks?limit=20&offset=10');
      expect(res.status).toBe(200);
      const result = res.body[0];
      expect(result.opts.limit).toBe(20);
      expect(result.opts.offset).toBe(10);
    });
  });

  describe('GET /admin/tasks/history (deprecated, redirects)', () => {
    it('should redirect to /admin/tasks with query params preserved', async () => {
      const res = await request(app).get('/admin/tasks/history?status=COMPLETED&limit=5');
      expect(res.status).toBe(301);
      expect(res.headers.location).toContain('/admin/tasks');
    });
  });
});
