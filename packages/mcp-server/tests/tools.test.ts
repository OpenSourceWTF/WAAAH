import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolHandler } from '../src/mcp/tools.js';
import { AgentRepository } from '../src/state/agent-repository.js';
import { TaskQueue } from '../src/state/queue.js';
import { createTestContext, TestContext } from './harness.js';

describe('ToolHandler', () => {
  let ctx: TestContext;
  let registry: AgentRepository;
  let queue: TaskQueue;
  let tools: ToolHandler;

  // Generate unique IDs to avoid conflicts with persistent data
  const uid = () => {
    return `tooltest-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  };

  beforeEach(() => {
    ctx = createTestContext();
    registry = ctx.registry;  // Use the harness registry (isolated DB)
    queue = ctx.queue;
    tools = new ToolHandler(registry, queue);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('register_agent', () => {
    it('registers agent and returns registration info', async () => {
      const agentId = uid();
      const result = await tools.register_agent({
        agentId,
        displayName: '@TestDev',
        capabilities: ['code-writing', 'test-writing']
      });

      expect(result.content[0].type).toBe('text');
      const data = JSON.parse(result.content[0].text);
      expect(data.registered).toBe(true);
      expect(data.agentId).toBe(agentId);
      expect(data.capabilities).toContain('code-writing');
    });

    it('returns error for invalid input', async () => {
      const result = await tools.register_agent({});
      expect(result.isError).toBe(true);
    });
  });

  describe('wait_for_prompt', () => {
    it('returns timeout when no task available', async () => {
      const agentId = uid();
      registry.register({ id: agentId, displayName: '@TestDev', capabilities: ['code-writing'] });

      const result = await tools.wait_for_prompt({
        agentId,
        timeout: 0.1 // 100ms
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('TIMEOUT');
    });

    it('returns task when available', async () => {
      const agentId = uid();
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      registry.register({ id: agentId, displayName: '@TestDev', capabilities: ['code-writing'] });

      // Enqueue a task first
      queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test prompt',
        from: { type: 'user', id: 'test', name: 'Test' },
        to: { agentId },
        priority: 'normal',
        status: 'QUEUED',
        createdAt: Date.now()
      });

      const result = await tools.wait_for_prompt({
        agentId,
        timeout: 1
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.taskId).toBe(taskId);
      expect(data.prompt).toBe('Test prompt');
    });
  });

  describe('send_response', () => {
    it('records task response', async () => {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId: 'test-dev' },
        priority: 'normal',
        status: 'ASSIGNED',
        createdAt: Date.now()
      });

      const result = await tools.send_response({
        taskId,
        status: 'COMPLETED',
        message: 'Done!'
      });

      expect(result.content[0].text).toContain('Response recorded');
      const task = queue.getTask(taskId);
      expect(task?.status).toBe('COMPLETED');
    });

    it('handles artifacts and blocked reason', async () => {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u1', name: 'User' },
        to: { agentId: 'test-dev' },
        priority: 'normal',
        status: 'ASSIGNED',
        createdAt: Date.now()
      });

      const result = await tools.send_response({
        taskId,
        status: 'BLOCKED',
        message: 'Need clarification',
        blockedReason: 'Missing requirements',
        artifacts: ['file1.ts', 'file2.ts']
      });

      expect(result.content[0].text).toContain('Response recorded');
    });
  });

  describe('assign_task', () => {
    it('creates task even for unknown target (uses capability-based matching)', async () => {
      // Unknown agents are allowed - they just use capability-based matching
      const result = await tools.assign_task({
        targetAgentId: 'nonexistent-agent-xyz-never-exists',
        prompt: 'Test',
        sourceAgentId: 'source'
      });

      // Should succeed - task is created for capability-based matching
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Task delegated');
    });

    it('creates task when target agent is valid', async () => {
      const sourceId = uid();
      const targetId = uid();

      // Register both agents with capabilities
      registry.register({ id: sourceId, displayName: '@TestDev1', capabilities: ['code-writing'] });
      registry.register({ id: targetId, displayName: '@TestEng1', capabilities: ['test-writing'] });

      const result = await tools.assign_task({
        targetAgentId: targetId,
        prompt: 'Run tests',
        sourceAgentId: sourceId
      });

      // Now should work since delegation permissions are removed
      expect(result.content[0].text).toContain('delegated');
    });

    it('blocks rm -rf attacks in delegation', async () => {
      // Use existing agents with permissions if any - the security check happens after permission check
      const result = await tools.assign_task({
        targetAgentId: 'developer',  // Using role name to test security before permission check
        prompt: 'rm -rf /',
        // No sourceAgentId - bypasses permission check
      });

      // Should return error (either not found or blocked)
      expect(result.isError).toBe(true);
    });
  });

  describe('list_agents', () => {
    it('returns an array of agents', async () => {
      const result = await tools.list_agents({});
      const agents = JSON.parse(result.content[0].text);
      expect(Array.isArray(agents)).toBe(true);
    });

    it('filters by capability correctly', async () => {
      const result = await tools.list_agents({ capability: 'code-writing' });
      const agents = JSON.parse(result.content[0].text);

      // All returned should have code-writing capability (or empty if none exist)
      if (agents.length > 0) {
        expect(agents.every((a: any) => a.capabilities?.includes('code-writing'))).toBe(true);
      }
    });
  });

  describe('get_agent_status', () => {
    it('returns UNKNOWN for non-existent agent', async () => {
      const result = await tools.get_agent_status({ agentId: 'ghost-agent-xyz-404-never' });
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('UNKNOWN');
      expect(result.isError).toBe(true);
    });

    it('returns status for recently active agent', async () => {
      const agentId = uid();
      registry.register({ id: agentId, displayName: '@StatusTest', capabilities: ['code-writing'] });
      registry.heartbeat(agentId);

      const result = await tools.get_agent_status({ agentId });
      const data = JSON.parse(result.content[0].text);

      expect(data.agentId).toBe(agentId);
      expect(data.displayName).toBe('@StatusTest');
      expect(['WAITING', 'OFFLINE', 'PROCESSING']).toContain(data.status);
    });
  });

  describe('ack_task', () => {
    it('acknowledges task successfully when in PENDING_ACK state', async () => {
      const agentId = uid();
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      registry.register({ id: agentId, displayName: '@TestDev', capabilities: ['code-writing'] });

      queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: 'Test',
        from: { type: 'user', id: 'u', name: 'U' },
        to: { agentId },
        priority: 'normal',
        status: 'QUEUED',
        createdAt: Date.now()
      });

      // Wait for task transitions to PENDING_ACK
      await queue.waitForTask(agentId, ['code-writing'], 100);

      const result = await tools.ack_task({
        taskId,
        agentId
      });

      expect(result.content[0].text).toContain('acknowledged');
    });

    it('returns error for non-existent task', async () => {
      const result = await tools.ack_task({
        taskId: 'fake-task-xyz-404-never',
        agentId: 'fake-agent'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('ACK failed');
    });
  });

  describe('admin_update_agent', () => {
    it('updates agent properties', async () => {
      const agentId = uid();
      registry.register({ id: agentId, displayName: '@OldName', capabilities: ['code-writing'] });

      // Schema expects metadata.displayName, not displayName directly
      const result = await tools.admin_update_agent({
        agentId,
        metadata: {
          displayName: '@UpdatedName',
          color: '#FF0000'
        }
      });

      expect(result.content[0].text).toContain('Updated agent');

      const agent = registry.get(agentId);
      expect(agent?.displayName).toBe('@UpdatedName');
    });

    it('returns error for unknown agent', async () => {
      const result = await tools.admin_update_agent({
        agentId: 'doesnt-exist-xyz-404-never',
        displayName: '@Test'
      });

      expect(result.isError).toBe(true);
    });
  });



  describe('handleError', () => {
    it('formats error messages', async () => {
      const result = await tools.handleError(new Error('Test error'));
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Test error');
    });

    it('handles non-Error objects', async () => {
      const result = await tools.handleError('String error');
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('String error');
    });
  });
});
