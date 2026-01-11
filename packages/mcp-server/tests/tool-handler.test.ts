/**
 * ToolHandler Tests
 * 
 * Tests for the main MCP ToolHandler class.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolHandler } from '../src/mcp/tools.js';
import { createTestContext, TestContext } from './harness.js';

describe('ToolHandler', () => {
  let ctx: TestContext;
  let handler: ToolHandler;

  beforeEach(() => {
    ctx = createTestContext();
    handler = new ToolHandler(ctx.registry, ctx.queue);
  });

  afterEach(() => {
    ctx.close();
  });

  describe('register_agent', () => {
    it('registers an agent with valid args', async () => {
      const result = await handler.register_agent({
        agentId: 'test-agent',
        role: 'developer',
        capabilities: ['code-writing']
      });

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
    });
  });

  describe('list_agents', () => {
    it('returns list of agents', async () => {
      const result = await handler.list_agents({});
      expect(result.content).toBeDefined();
    });
  });

  describe('get_agent_status', () => {
    it('returns agent status', async () => {
      const result = await handler.get_agent_status({ agentId: 'unknown' });
      expect(result.content).toBeDefined();
    });
  });

  describe('send_response', () => {
    it('handles valid response', async () => {
      // First create a task
      await handler.register_agent({
        agentId: 'resp-agent',
        role: 'developer',
        capabilities: ['code-writing']
      });

      const result = await handler.send_response({
        taskId: 'nonexistent',
        status: 'COMPLETED',
        message: 'Done'
      });

      // Returns error for non-existent task
      expect(result.content).toBeDefined();
    });
  });

  describe('assign_task', () => {
    it('handles task assignment', async () => {
      const result = await handler.assign_task({
        prompt: 'Test task',
        targetAgentId: 'target'
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('ack_task', () => {
    it('handles task acknowledgment', async () => {
      const result = await handler.ack_task({
        taskId: 'nonexistent',
        agentId: 'agent-1'
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('block_task', () => {
    it('handles blocking a task', async () => {
      const result = await handler.block_task({
        taskId: 'nonexistent',
        reason: 'clarification',
        question: 'Need more info',
        summary: 'Partial work done'
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('get_task_context', () => {
    it('returns task context', async () => {
      const result = await handler.get_task_context({ taskId: 'nonexistent' });
      expect(result.content).toBeDefined();
    });
  });

  describe('update_progress', () => {
    it('handles progress update', async () => {
      const result = await handler.update_progress({
        taskId: 'nonexistent',
        agentId: 'agent-1',
        message: 'Working...',
        percentage: 50
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('scaffold_plan', () => {
    it('handles plan scaffolding', async () => {
      const result = await handler.scaffold_plan({
        taskId: 'nonexistent',
        title: 'Test Plan'
      });

      expect(result.content).toBeDefined();
    });
  });

  // wait_for_prompt is tested via wait-handlers.test.ts with proper async handling

  describe('admin_update_agent', () => {
    it('handles agent updates', async () => {
      const result = await handler.admin_update_agent({
        agentId: 'nonexistent',
        metadata: { note: 'test' }
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('admin_evict_agent', () => {
    it('handles agent eviction', async () => {
      await handler.register_agent({
        agentId: 'evict-target',
        role: 'developer',
        capabilities: ['code-writing']
      });

      const result = await handler.admin_evict_agent({
        agentId: 'evict-target',
        reason: 'Test eviction'
      });

      expect(result.content).toBeDefined();
    });
  });
});
