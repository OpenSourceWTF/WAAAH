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
  });

  describe('broadcast_system_prompt', () => {
    it('returns error for invalid args', async () => {
      const mockRegistry: any = {};
      const mockQueue: any = {};

      const handlers = new WaitHandlers(mockRegistry, mockQueue);
      const result = await handlers.broadcast_system_prompt({});

      expect((result as any).isError).toBe(true);
    });
  });
});
