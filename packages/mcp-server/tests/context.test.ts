/**
 * Server Context Tests
 *
 * Tests for the dependency injection container.
 */
import { describe, it, expect } from 'vitest';
import { createTestContext, type ServerContext } from '../src/state/context.js';

describe('ServerContext', () => {
  describe('createTestContext', () => {
    it('creates a complete context with all dependencies', () => {
      const ctx = createTestContext();

      expect(ctx.db).toBeDefined();
      expect(ctx.taskRepo).toBeDefined();
      expect(ctx.agentRepo).toBeDefined();
      expect(ctx.queue).toBeDefined();
      expect(ctx.registry).toBeDefined();
      expect(ctx.eventLog).toBeDefined();
      expect(ctx.securityLog).toBeDefined();
      expect(ctx.close).toBeDefined();
      expect(ctx.isHealthy).toBeDefined();

      ctx.close();
    });

    it('creates isolated contexts', () => {
      const ctx1 = createTestContext();
      const ctx2 = createTestContext();

      // Separate databases
      expect(ctx1.db).not.toBe(ctx2.db);

      ctx1.close();
      ctx2.close();
    });
  });

  describe('isHealthy', () => {
    it('returns true for healthy database', () => {
      const ctx = createTestContext();

      expect(ctx.isHealthy()).toBe(true);

      ctx.close();
    });

    it('returns false for closed database', () => {
      const ctx = createTestContext();
      ctx.close();

      // After closing, database queries should fail
      expect(ctx.isHealthy()).toBe(false);
    });
  });

  describe('close', () => {
    it('can be called multiple times safely', () => {
      const ctx = createTestContext();

      // Should not throw on repeated calls
      ctx.close();
      ctx.close();
      ctx.close();
    });

    it('silently handles close errors', () => {
      const ctx = createTestContext();

      // First close
      ctx.close();

      // Second close should not throw
      expect(() => ctx.close()).not.toThrow();
    });
  });

  describe('registry alias', () => {
    it('registry is the same as agentRepo', () => {
      const ctx = createTestContext();

      // Registry is an alias to agentRepo
      expect(ctx.registry).toBe(ctx.agentRepo);

      ctx.close();
    });
  });
});
