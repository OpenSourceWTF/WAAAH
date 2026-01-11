/**
 * Tool Router Tests
 * 
 * Tests for the MCP tool routing layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createToolRouter } from '../src/routes/toolRouter.js';

describe('Tool Router', () => {
  let app: express.Express;
  let mockTools: any;
  let mockCtx: any;

  beforeEach(() => {
    mockTools = {
      register_agent: vi.fn().mockResolvedValue({ success: true, agentId: 'agent-1' }),
      send_response: vi.fn().mockResolvedValue({ success: true }),
      list_agents: vi.fn().mockResolvedValue({ agents: [] }),
      get_agent_status: vi.fn().mockResolvedValue({ status: 'active' }),
      ack_task: vi.fn().mockResolvedValue({ success: true }),
      get_task_context: vi.fn().mockResolvedValue({ task: null }),
      update_progress: vi.fn().mockResolvedValue({ success: true }),
      block_task: vi.fn().mockResolvedValue({ success: true }),
      assign_task: vi.fn().mockResolvedValue({ taskId: 'task-1' })
    };

    mockCtx = {
      registry: {
        heartbeat: vi.fn()
      },
      db: {}
    };

    app = express();
    app.use(express.json());
    app.use('/mcp/tools', createToolRouter(mockTools, mockCtx));
  });

  describe('POST /mcp/tools/:toolName', () => {
    it('calls register_agent tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/register_agent')
        .send({ agentId: 'test-agent', role: 'developer' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTools.register_agent).toHaveBeenCalled();
    });

    it('calls send_response tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/send_response')
        .send({ taskId: 'task-1', status: 'COMPLETED', message: 'Done' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockTools.send_response).toHaveBeenCalled();
    });

    it('calls list_agents tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/list_agents')
        .send({})
        .expect(200);

      expect(res.body.agents).toEqual([]);
      expect(mockTools.list_agents).toHaveBeenCalled();
    });

    it('returns 404 for unknown tool', async () => {
      const res = await request(app)
        .post('/mcp/tools/unknown_tool')
        .send({})
        .expect(404);

      expect(res.body.error).toContain('not found');
    });

    it('calls heartbeat for agent-related tools', async () => {
      await request(app)
        .post('/mcp/tools/update_progress')
        .send({ agentId: 'test-agent', taskId: 'task-1', message: 'Working' })
        .expect(200);

      // Heartbeat middleware should process
      expect(mockTools.update_progress).toHaveBeenCalled();
    });

    it('calls get_task_context', async () => {
      const res = await request(app)
        .post('/mcp/tools/get_task_context')
        .send({ taskId: 'task-1' })
        .expect(200);

      expect(mockTools.get_task_context).toHaveBeenCalled();
    });

    it('calls block_task', async () => {
      const res = await request(app)
        .post('/mcp/tools/block_task')
        .send({ taskId: 'task-1', reason: 'clarification', question: 'What?' })
        .expect(200);

      expect(mockTools.block_task).toHaveBeenCalled();
    });

    it('calls assign_task', async () => {
      const res = await request(app)
        .post('/mcp/tools/assign_task')
        .send({ targetAgentId: 'agent-2', prompt: 'Do something' })
        .expect(200);

      expect(res.body.taskId).toBe('task-1');
    });
  });
});
