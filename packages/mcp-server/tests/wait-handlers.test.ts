/**
 * Wait Handlers Tests
 * 
 * Basic tests for wait handler initialization.
 * Complex mocking of async wait operations is handled by integration tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { WaitHandlers } from '../src/mcp/handlers/wait-handlers.js';

describe('WaitHandlers', () => {
  it('can be instantiated with registry and queue', () => {
    const mockRegistry: any = { get: vi.fn(), heartbeat: vi.fn() };
    const mockQueue: any = { waitForTask: vi.fn(), waitForTaskCompletion: vi.fn() };

    const handlers = new WaitHandlers(mockRegistry, mockQueue);

    expect(handlers).toBeDefined();
    expect(handlers.wait_for_prompt).toBeInstanceOf(Function);
    expect(handlers.wait_for_task).toBeInstanceOf(Function);
    expect(handlers.broadcast_system_prompt).toBeInstanceOf(Function);
  });

  describe('wait_for_prompt', () => {
    it('returns error for invalid args', async () => {
      const mockRegistry: any = { get: vi.fn(), heartbeat: vi.fn() };
      const mockQueue: any = { waitForTask: vi.fn() };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.wait_for_prompt({});

      expect((result as any).isError).toBe(true);
    });
  });

  describe('wait_for_task', () => {
    it('returns error for invalid args', async () => {
      const mockRegistry: any = { get: vi.fn() };
      const mockQueue: any = { waitForTaskCompletion: vi.fn() };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.wait_for_task({});

      expect((result as any).isError).toBe(true);
    });

    it('returns NOT_FOUND when task does not exist', async () => {
      const mockRegistry: any = { get: vi.fn() };
      const mockQueue: any = { waitForTaskCompletion: vi.fn().mockResolvedValue(null) };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.wait_for_task({ taskId: 'nonexistent' });

      expect((result as any).isError).toBe(true);
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.status).toBe('NOT_FOUND');
    });

    it('returns task completion status for COMPLETED task', async () => {
      const mockRegistry: any = { get: vi.fn() };
      const mockQueue: any = {
        waitForTaskCompletion: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'COMPLETED',
          response: 'Done'
        })
      };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.wait_for_task({ taskId: 'task-1' });

      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.taskId).toBe('task-1');
      expect(parsed.status).toBe('COMPLETED');
      expect(parsed.completed).toBe(true);
    });

    it('returns task status for non-terminal task', async () => {
      const mockRegistry: any = { get: vi.fn() };
      const mockQueue: any = {
        waitForTaskCompletion: vi.fn().mockResolvedValue({
          id: 'task-1',
          status: 'IN_PROGRESS',
          response: null
        })
      };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.wait_for_task({ taskId: 'task-1' });

      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.completed).toBe(false);
    });
  });

  describe('broadcast_system_prompt', () => {
    it('returns error for invalid args', async () => {
      const mockRegistry: any = {};
      const mockQueue: any = {};

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.broadcast_system_prompt({});

      expect((result as any).isError).toBe(true);
    });

    it('broadcasts to all agents when broadcast=true', async () => {
      const mockRegistry: any = {
        getAll: vi.fn().mockReturnValue([
          { id: 'agent-1', capabilities: [] },
          { id: 'agent-2', capabilities: [] }
        ])
      };
      const mockQueue: any = { queueSystemPrompt: vi.fn() };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.broadcast_system_prompt({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Test broadcast',
        broadcast: true
      });

      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.targetCount).toBe(2);
      expect(mockQueue.queueSystemPrompt).toHaveBeenCalledTimes(2);
    });

    it('broadcasts to agents with specific capability', async () => {
      const mockRegistry: any = {
        getAll: vi.fn().mockReturnValue([
          { id: 'agent-1', capabilities: ['code-writing'] },
          { id: 'agent-2', capabilities: ['spec-writing'] },
          { id: 'agent-3', capabilities: ['code-writing'] }
        ])
      };
      const mockQueue: any = { queueSystemPrompt: vi.fn() };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.broadcast_system_prompt({
        promptType: 'WORKFLOW_UPDATE',
        message: 'Code update',
        targetCapability: 'code-writing'
      });

      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.targetCount).toBe(2);
      expect(parsed.targets).toContain('agent-1');
      expect(parsed.targets).toContain('agent-3');
    });

    it('sends to specific agent when targetAgentId provided', async () => {
      const mockRegistry: any = { getAll: vi.fn().mockReturnValue([]) };
      const mockQueue: any = { queueSystemPrompt: vi.fn() };

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.broadcast_system_prompt({
        promptType: 'EVICTION_NOTICE',
        message: 'Please shutdown',
        targetAgentId: 'specific-agent'
      });

      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.targetCount).toBe(1);
      expect(parsed.targets).toContain('specific-agent');
    });

    it('returns error when no agents matched', async () => {
      const mockRegistry: any = {
        getAll: vi.fn().mockReturnValue([
          { id: 'agent-1', capabilities: ['spec-writing'] }
        ])
      };
      const mockQueue: any = {};

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.broadcast_system_prompt({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Test',
        targetCapability: 'code-writing'  // valid capability but no agent has it
      });

      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('No agents');
    });
  });
});
