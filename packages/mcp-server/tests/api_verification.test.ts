import request from 'supertest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { app, server } from '../src/server';

// Mock dependencies
vi.mock('../src/state/queue.js', () => {
  return {
    TaskQueue: vi.fn().mockImplementation(function () {
      return {
        getAll: vi.fn().mockReturnValue([]),
        getTaskHistory: vi.fn(),
        getTask: vi.fn(),
        getTaskFromDB: vi.fn(),
        cancelTask: vi.fn((id) => {
          if (id === 'task-queued') return { success: true };
          if (id === 'task-completed') return { success: false, error: 'Cannot cancel completed task' };
          return { success: false, error: 'Task not found' };
        }),
        forceRetry: vi.fn(),
        queueEviction: vi.fn(),
        getStats: vi.fn().mockReturnValue({ total: 10, completed: 5 }),
        getLogs: vi.fn((limit) => ([
          { timestamp: 123, category: 'SYSTEM', message: 'Test Log 1', metadata: {} },
          { timestamp: 124, category: 'AGENT', message: 'Test Log 2', metadata: {} }
        ])),
        on: vi.fn(),
        getBusyAgentIds: vi.fn().mockReturnValue([]),
        getWaitingAgents: vi.fn().mockReturnValue([]),
        startScheduler: vi.fn(),
        stopScheduler: vi.fn(),
        clear: vi.fn()
      };
    })
  };
});

vi.mock('../src/state/registry.js', () => {
  return {
    AgentRegistry: vi.fn().mockImplementation(function () {
      return {
        getAll: vi.fn().mockReturnValue([{ id: 'agent-1', status: 'WAITING' }]),
        requestEviction: vi.fn((id) => id === 'agent-1'),
        cleanup: vi.fn()
      }
    })
  }
});

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

// Mock events to prevent DB writes
vi.mock('../src/state/events.js', () => ({
  eventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn()
  },
  emitActivity: vi.fn()
}));


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
