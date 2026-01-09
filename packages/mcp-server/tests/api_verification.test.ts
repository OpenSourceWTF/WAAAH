import request from 'supertest';
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock context.js to use test context (in-memory) with proper mocks
vi.mock('../src/state/context.js', () => {
  const Database = require('better-sqlite3');

  const createContext = () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, role TEXT, displayName TEXT, capabilities TEXT, lastSeen INTEGER, createdAt INTEGER, eviction_requested BOOLEAN DEFAULT 0, eviction_reason TEXT, canDelegateTo TEXT, color TEXT);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, status TEXT, prompt TEXT, title TEXT, priority TEXT, fromAgentId TEXT, toAgentId TEXT, toAgentRole TEXT, context TEXT, response TEXT, createdAt INTEGER, completedAt INTEGER, assignedTo TEXT, dependencies TEXT, history TEXT, fromAgentName TEXT);
      CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp INTEGER, category TEXT, message TEXT, metadata TEXT);
      CREATE TABLE IF NOT EXISTS aliases (alias TEXT PRIMARY KEY, agentId TEXT);
    `);

    // Insert test logs
    const insertLog = db.prepare('INSERT INTO logs (timestamp, category, message, metadata) VALUES (?, ?, ?, ?)');
    insertLog.run(123, 'SYSTEM', 'Test Log 1', '{}');
    insertLog.run(124, 'AGENT', 'Test Log 2', '{}');

    return {
      db,
      registry: {
        getAll: () => [{ id: 'agent-1', status: 'WAITING', role: 'developer', displayName: '@Agent1' }],
        cleanup: () => { },
        requestEviction: (id: string) => id === 'agent-1'
      },
      queue: {
        startScheduler: () => { },
        stopScheduler: () => { },
        getAll: () => [],
        on: () => { },
        getBusyAgentIds: () => [],
        getWaitingAgents: () => [],
        getTaskHistory: () => [],
        getTask: () => undefined,
        getTaskFromDB: () => undefined,
        cancelTask: (id: string) => {
          if (id === 'task-queued') return { success: true };
          if (id === 'task-completed') return { success: false, error: 'Cannot cancel completed task' };
          return { success: false, error: 'Task not found' };
        },
        forceRetry: () => { },
        queueEviction: () => { },
        getStats: () => ({ total: 10, completed: 5 }),
        getLogs: () => [
          { timestamp: 123, category: 'SYSTEM', message: 'Test Log 1', metadata: {} },
          { timestamp: 124, category: 'AGENT', message: 'Test Log 2', metadata: {} }
        ],
        clear: () => { }
      },
      taskRepo: {},
      agentRepo: {},
      eventLog: {},
      securityLog: {},
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

// Mock events to prevent DB writes
vi.mock('../src/state/events.js', () => ({
  eventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  },
  emitActivity: vi.fn(),
  initEventLog: vi.fn()
}));

// Mock ToolHandler to avoid complex init
vi.mock('../src/mcp/tools.js', () => {
  return {
    ToolHandler: vi.fn().mockImplementation(function () {
      return {
        list_connected_agents: vi.fn().mockResolvedValue({ content: [{ text: '[]' }] }),
        register_agent: vi.fn(),
        wait_for_prompt: vi.fn(),
        send_response: vi.fn(),
        assign_task: vi.fn(),
        list_agents: vi.fn(),
        get_agent_status: vi.fn(),
        ack_task: vi.fn(),
        admin_update_agent: vi.fn(),
        admin_evict_agent: vi.fn(),
        wait_for_task: vi.fn()
      };
    })
  }
});

import { app, server } from '../src/server';

describe('API Verification: Activity Feed & Controls', () => {
  afterEach(() => {
    if (server) server.close();
  });

  describe('GET /admin/logs', () => {
    it('should return a list of logs', async () => {
      const res = await request(app).get('/admin/logs');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
      expect(res.body[0].message).toBe('Test Log 1');
    });
  });

  describe('POST /admin/tasks/:taskId/cancel', () => {
    it('should cancel a queued task', async () => {
      const res = await request(app).post('/admin/tasks/task-queued/cancel');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should fail to cancel a completed task', async () => {
      const res = await request(app).post('/admin/tasks/task-completed/cancel');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Cannot cancel completed task');
    });
  });

  describe('POST /admin/evict', () => {
    it('should queue eviction for an agent', async () => {
      const res = await request(app)
        .post('/admin/evict')
        .send({ agentId: 'agent-1', reason: 'Test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Eviction queued');
    });

    it('should validate missing agentId', async () => {
      const res = await request(app).post('/admin/evict').send({ reason: 'Test' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/agents/:agentId/evict', () => {
    it('should request eviction for known agent', async () => {
      const res = await request(app)
        .post('/admin/agents/agent-1/evict')
        .send({ reason: 'Test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for unknown agent', async () => {
      const res = await request(app)
        .post('/admin/agents/unknown-agent/evict')
        .send({ reason: 'Test' });

      expect(res.status).toBe(404);
    });
  });
});
