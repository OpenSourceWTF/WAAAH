/**
 * Eviction Service Tests
 * 
 * Unit tests for queue-level eviction signal delivery.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestContext, TestContext } from './harness.js';

describe('EvictionService', () => {
  let ctx: TestContext;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createTestContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    ctx?.close();
  });

  describe('queueEviction', () => {
    it('sets eviction flags in database', () => {
      // Register an agent first
      ctx.registry.register({ id: 'agent-1', displayName: 'Test Agent', capabilities: ['code-writing'] });

      // Queue eviction
      ctx.queue.queueEviction('agent-1', 'Test reason', 'RESTART');

      // Check DB flags
      const row = ctx.db.prepare('SELECT eviction_requested, eviction_reason, eviction_action FROM agents WHERE id = ?').get('agent-1') as any;
      expect(row.eviction_requested).toBe(1);
      expect(row.eviction_reason).toBe('Test reason');
      expect(row.eviction_action).toBe('RESTART');
    });

    it('does not downgrade SHUTDOWN to RESTART', () => {
      ctx.registry.register({ id: 'agent-1', displayName: 'Test Agent', capabilities: ['code-writing'] });

      // Queue SHUTDOWN first
      ctx.queue.queueEviction('agent-1', 'Critical', 'SHUTDOWN');
      // Try to queue RESTART
      ctx.queue.queueEviction('agent-1', 'Less critical', 'RESTART');

      const row = ctx.db.prepare('SELECT eviction_action FROM agents WHERE id = ?').get('agent-1') as any;
      expect(row.eviction_action).toBe('SHUTDOWN'); // Should stay SHUTDOWN
    });
  });

  describe('popEviction', () => {
    it('returns and clears eviction signal', () => {
      ctx.registry.register({ id: 'agent-1', displayName: 'Test Agent', capabilities: ['code-writing'] });

      ctx.queue.queueEviction('agent-1', 'Test reason', 'RESTART');

      // Pop eviction
      const eviction = ctx.queue.popEviction('agent-1');
      expect(eviction).not.toBeNull();
      expect(eviction?.reason).toBe('Test reason');
      expect(eviction?.action).toBe('RESTART');

      // Should be cleared now
      const eviction2 = ctx.queue.popEviction('agent-1');
      expect(eviction2).toBeNull();
    });
  });

  describe('waitForTask with eviction', () => {
    it('returns eviction signal immediately if pending', async () => {
      ctx.registry.register({ id: 'agent-1', displayName: 'Test Agent', capabilities: ['code-writing'] });

      // Queue eviction before agent waits
      ctx.queue.queueEviction('agent-1', 'Evicted', 'RESTART');

      // Agent waits for task
      const result = await ctx.queue.waitForTask('agent-1', ['code-writing'], 1000);

      expect(result).not.toBeNull();
      expect('controlSignal' in result!).toBe(true);
      if ('controlSignal' in result!) {
        expect(result.controlSignal).toBe('EVICT');
        expect(result.reason).toBe('Evicted');
        expect(result.action).toBe('RESTART');
      }
    });

    it('interrupts waiting agent on eviction', async () => {
      ctx.registry.register({ id: 'agent-1', displayName: 'Test Agent', capabilities: ['code-writing'] });

      // Agent starts waiting
      const waitPromise = ctx.queue.waitForTask('agent-1', ['code-writing'], 10000);

      // Queue eviction while waiting
      ctx.queue.queueEviction('agent-1', 'Interrupted', 'SHUTDOWN');

      const result = await waitPromise;

      expect(result).not.toBeNull();
      expect('controlSignal' in result!).toBe(true);
      if ('controlSignal' in result!) {
        expect(result.controlSignal).toBe('EVICT');
        expect(result.reason).toBe('Interrupted');
        expect(result.action).toBe('SHUTDOWN');
      }
    });
  });
});
