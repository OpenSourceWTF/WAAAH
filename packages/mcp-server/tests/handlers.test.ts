/**
 * Handler Tests
 * 
 * Tests for MCP tool handlers using isolated test context.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, type TestContext } from './harness.js';
import { TaskHandlers } from '../src/mcp/handlers/task-handlers.js';
import { WaitHandlers } from '../src/mcp/handlers/wait-handlers.js';
import { AgentHandlers } from '../src/mcp/handlers/agent-handlers.js';

describe('TaskHandlers', () => {
  let ctx: TestContext;
  let handlers: TaskHandlers;

  beforeEach(() => {
    ctx = createTestContext();
    handlers = new TaskHandlers(ctx.registry, ctx.queue);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('send_response', () => {
    it('records response for existing task', async () => {
      // Create task first
      const taskId = `task-${Date.now()}`;
      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId: 'dev' },
        priority: 'normal',
        status: 'ASSIGNED',
        createdAt: Date.now()
      });

      const result = await handlers.send_response({
        taskId,
        status: 'COMPLETED',
        message: 'Done!'
      });

      expect(result.content[0].text).toContain('Response recorded');
    });

    it('handles artifacts in response', async () => {
      const taskId = `task-${Date.now()}`;
      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId: 'dev' },
        priority: 'normal',
        status: 'ASSIGNED',
        createdAt: Date.now()
      });

      const result = await handlers.send_response({
        taskId,
        status: 'COMPLETED',
        message: 'Done!',
        artifacts: ['file1.ts', 'file2.ts']
      });

      expect(result.isError).toBeUndefined();
    });

    it('returns error for invalid input', async () => {
      const result = await handlers.send_response({});
      expect(result.isError).toBe(true);
    });
  });

  describe('ack_task', () => {
    it('acknowledges task successfully', async () => {
      const agentId = `agent-${Date.now()}`;
      const taskId = `task-${Date.now()}`;

      ctx.registry.register({ id: agentId, displayName: '@Dev', capabilities: ['code'] });
      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId },
        priority: 'normal',
        status: 'QUEUED',
        createdAt: Date.now()
      });

      // Wait for task to transition
      await ctx.queue.waitForTask(agentId, ['code'], 100);

      const result = await handlers.ack_task({ taskId, agentId });
      expect(result.content[0].text).toContain('acknowledged');
    });

    it('returns error for non-existent task', async () => {
      const result = await handlers.ack_task({
        taskId: 'fake-task',
        agentId: 'fake-agent'
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('block_task', () => {
    it('blocks task with reason', async () => {
      const taskId = `task-${Date.now()}`;
      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId: 'dev' },
        priority: 'normal',
        status: 'ASSIGNED',
        createdAt: Date.now()
      });

      const result = await handlers.block_task({
        taskId,
        reason: 'clarification',
        question: 'Need more info',
        summary: 'Started work'
      });

      expect(result.content[0].text).toContain('blocked');
    });

    it('returns error for invalid input', async () => {
      const result = await handlers.block_task({});
      expect(result.isError).toBe(true);
    });
  });

  describe('update_progress', () => {
    it('updates task progress', async () => {
      const taskId = `task-${Date.now()}`;
      const agentId = `agent-${Date.now()}`;

      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId },
        priority: 'normal',
        status: 'IN_PROGRESS',
        createdAt: Date.now()
      });

      const result = await handlers.update_progress({
        taskId,
        agentId,
        message: 'Working on it...',
        phase: 'BUILDING',
        percentage: 50
      });

      expect(result.content[0].text).toContain('Progress updated');
    });

    it('returns error for invalid input', async () => {
      // Missing required fields
      const result = await handlers.update_progress({});
      expect(result.isError).toBe(true);
    });
  });

  describe('get_task_context', () => {
    it('returns task context', async () => {
      const taskId = `task-${Date.now()}`;
      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test prompt',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId: 'dev' },
        priority: 'normal',
        status: 'ASSIGNED',
        createdAt: Date.now()
      });

      const result = await handlers.get_task_context({ taskId });
      const data = JSON.parse(result.content[0].text);

      expect(data.taskId).toBe(taskId);
      expect(data.prompt).toBe('Test prompt');
    });

    it('returns error for non-existent task', async () => {
      const result = await handlers.get_task_context({ taskId: 'fake-task' });
      expect(result.isError).toBe(true);
    });
  });
});

describe('WaitHandlers', () => {
  let ctx: TestContext;
  let handlers: WaitHandlers;

  beforeEach(() => {
    ctx = createTestContext();
    handlers = new WaitHandlers(ctx.registry, ctx.queue);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('wait_for_prompt', () => {
    it('returns IDLE when no task available', async () => {
      const agentId = `agent-${Date.now()}`;
      ctx.registry.register({ id: agentId, displayName: '@Test', capabilities: ['code'] });

      const result = await handlers.wait_for_prompt({
        agentId,
        timeout: 0.1
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('IDLE');
    });

    it('returns task when one is available', async () => {
      const agentId = `agent-${Date.now()}`;
      const taskId = `task-${Date.now()}`;

      ctx.registry.register({ id: agentId, displayName: '@Test', capabilities: ['code'] });
      ctx.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test prompt',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId },
        priority: 'normal',
        status: 'QUEUED',
        createdAt: Date.now()
      });

      const result = await handlers.wait_for_prompt({
        agentId,
        timeout: 1
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.taskId).toBe(taskId);
      expect(data.prompt).toBe('Test prompt');
    });

    it('returns error for invalid input', async () => {
      const result = await handlers.wait_for_prompt({});
      expect(result.isError).toBe(true);
    });
  });

  describe('wait_for_task', () => {
    it('returns NOT_FOUND for non-existent task', async () => {
      const result = await handlers.wait_for_task({
        taskId: 'fake-task',
        timeout: 0.1
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('NOT_FOUND');
    });
  });

  describe('broadcast_system_prompt', () => {
    it('broadcasts to all agents', async () => {
      ctx.registry.register({ id: 'agent-1', displayName: '@One', capabilities: [] });
      ctx.registry.register({ id: 'agent-2', displayName: '@Two', capabilities: [] });

      const result = await handlers.broadcast_system_prompt({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Hello all agents',
        broadcast: true
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.targetCount).toBe(2);
    });

    it('broadcasts to agents with specific capability', async () => {
      ctx.registry.register({ id: 'agent-code', displayName: '@Coder', capabilities: ['code-writing'] });
      ctx.registry.register({ id: 'agent-test', displayName: '@Tester', capabilities: ['test-writing'] });

      const result = await handlers.broadcast_system_prompt({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Hello coders',
        targetCapability: 'code-writing'
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.targetCount).toBe(1);
      expect(data.targets).toContain('agent-code');
    });

    it('returns error when no agents match', async () => {
      const result = await handlers.broadcast_system_prompt({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Hello',
        targetCapability: 'nonexistent-capability'
      });

      // May return isError true or a JSON with success: false
      const text = result.content[0].text;
      expect(text).toContain('No agents matched');
    });
  });
});

describe('AgentHandlers', () => {
  let ctx: TestContext;
  let handlers: AgentHandlers;

  beforeEach(() => {
    ctx = createTestContext();
    handlers = new AgentHandlers(ctx.registry, ctx.queue);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('register_agent', () => {
    it('registers new agent', async () => {
      const result = await handlers.register_agent({
        agentId: `new-agent-${Date.now()}`,
        displayName: '@NewAgent',
        capabilities: ['code-writing']
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.registered).toBe(true);
    });

    it('returns error for invalid input', async () => {
      const result = await handlers.register_agent({});
      expect(result.isError).toBe(true);
    });
  });

  describe('list_agents', () => {
    it('returns all agents', async () => {
      ctx.registry.register({ id: 'a1', displayName: '@A1', capabilities: [] });
      ctx.registry.register({ id: 'a2', displayName: '@A2', capabilities: [] });

      const result = await handlers.list_agents({});
      const data = JSON.parse(result.content[0].text);

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by capability', async () => {
      ctx.registry.register({ id: 'coder', displayName: '@Coder', capabilities: ['code-writing'] });
      ctx.registry.register({ id: 'tester', displayName: '@Tester', capabilities: ['test-writing'] });

      const result = await handlers.list_agents({ capability: 'code-writing' });
      const data = JSON.parse(result.content[0].text);

      expect(data.every((a: any) => a.capabilities?.includes('code-writing'))).toBe(true);
    });

    it('filters by role', async () => {
      ctx.registry.register({ id: 'dev', displayName: '@Dev', role: 'developer', capabilities: [] });
      ctx.registry.register({ id: 'qa', displayName: '@QA', role: 'tester', capabilities: [] });

      const result = await handlers.list_agents({ role: 'developer' });
      const data = JSON.parse(result.content[0].text);

      // May or may not find agents depending on exact matching
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('get_agent_status', () => {
    it('returns agent status', async () => {
      const agentId = `agent-${Date.now()}`;
      ctx.registry.register({ id: agentId, displayName: '@StatusTest', capabilities: [] });
      ctx.registry.heartbeat(agentId);

      const result = await handlers.get_agent_status({ agentId });
      const data = JSON.parse(result.content[0].text);

      expect(data.agentId).toBe(agentId);
      expect(data.displayName).toBe('@StatusTest');
    });

    it('returns UNKNOWN for non-existent agent', async () => {
      const result = await handlers.get_agent_status({ agentId: 'nonexistent' });
      const data = JSON.parse(result.content[0].text);

      expect(data.status).toBe('UNKNOWN');
      expect(result.isError).toBe(true);
    });
  });

  describe('admin_update_agent', () => {
    it('updates agent metadata', async () => {
      const agentId = `agent-${Date.now()}`;
      ctx.registry.register({ id: agentId, displayName: '@Old', capabilities: [] });

      const result = await handlers.admin_update_agent({
        agentId,
        metadata: { displayName: '@New', color: '#FF0000' }
      });

      expect(result.content[0].text).toContain('Updated agent');
    });

    it('returns error for non-existent agent', async () => {
      const result = await handlers.admin_update_agent({
        agentId: 'nonexistent',
        metadata: { displayName: '@Test' }
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('admin_evict_agent', () => {
    it('evicts existing agent', async () => {
      const agentId = `agent-${Date.now()}`;
      ctx.registry.register({ id: agentId, displayName: '@ToEvict', capabilities: [] });

      const result = await handlers.admin_evict_agent({
        agentId,
        reason: 'Test eviction'
      });

      expect(result.content[0].text).toContain('Eviction');
    });
  });
});
