/**
 * Test Harness Tests
 *
 * Tests for the test harness utility functions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestContext_, createTestContext, useTestContext } from './harness.js';

describe('Test Harness', () => {
  describe('createTestContext_', () => {
    it('creates an isolated test context', () => {
      const ctx = createTestContext_();

      expect(ctx).toBeDefined();
      expect(ctx.db).toBeDefined();
      expect(ctx.queue).toBeDefined();
      expect(ctx.registry).toBeDefined();
      expect(ctx.taskRepo).toBeDefined();
      expect(ctx.agentRepo).toBeDefined();
      expect(ctx.eventLog).toBeDefined();
      expect(ctx.securityLog).toBeDefined();
      expect(ctx.close).toBeDefined();
      expect(ctx.isHealthy).toBeDefined();
      expect(ctx.isHealthy()).toBe(true);

      ctx.close();
    });

    it('creates independent contexts on each call', () => {
      const ctx1 = createTestContext_();
      const ctx2 = createTestContext_();

      // Different contexts should be independent
      expect(ctx1).not.toBe(ctx2);
      expect(ctx1.db).not.toBe(ctx2.db);

      ctx1.close();
      ctx2.close();
    });
  });

  describe('createTestContext (re-export)', () => {
    it('is exported and callable', () => {
      const ctx = createTestContext();

      expect(ctx).toBeDefined();
      expect(typeof ctx.close).toBe('function');

      ctx.close();
    });
  });

  describe('useTestContext', () => {
    let testHelper: ReturnType<typeof useTestContext>;
    let mockBeforeEach: ReturnType<typeof vi.fn>;
    let mockAfterEach: ReturnType<typeof vi.fn>;
    let beforeEachCallback: () => void;
    let afterEachCallback: () => void;

    beforeEach(() => {
      // Capture the callbacks passed to before/afterEach
      mockBeforeEach = vi.fn((cb) => { beforeEachCallback = cb; });
      mockAfterEach = vi.fn((cb) => { afterEachCallback = cb; });
    });

    it('returns a getContext function', () => {
      // We can't easily test useTestContext since it calls vitest hooks directly
      // But we can verify the exported function exists
      expect(typeof useTestContext).toBe('function');
    });

    it('creates new context on each test (integration)', () => {
      // This is an integration test that manually simulates the hook behavior
      // by calling useTestContext in a test scope

      // The returned object should have getContext
      const result = useTestContext();
      expect(result).toHaveProperty('getContext');
      expect(typeof result.getContext).toBe('function');
    });
  });
});

describe('Test Harness Integration', () => {
  // Actually use the useTestContext helper
  const { getContext } = useTestContext();

  it('provides context via getContext', () => {
    const ctx = getContext();

    expect(ctx).toBeDefined();
    expect(ctx.db).toBeDefined();
    expect(ctx.queue).toBeDefined();
  });

  it('isolates database state between tests', () => {
    const ctx = getContext();

    // Add a task
    ctx.queue.enqueue({
      id: 'test-isolation-task',
      prompt: 'Test',
      workspaceId: 'test/repo'
    });

    const tasks = ctx.queue.getAll();
    expect(tasks.some(t => t.id === 'test-isolation-task')).toBe(true);
  });

  it('has fresh context for each test', () => {
    const ctx = getContext();

    // This test should not see the task from the previous test
    const tasks = ctx.queue.getAll();
    expect(tasks.some(t => t.id === 'test-isolation-task')).toBe(false);
  });
});
