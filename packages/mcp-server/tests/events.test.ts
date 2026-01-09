import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock database
const mockPrepare = vi.fn(() => ({ run: vi.fn() }));
const mockDb = { prepare: mockPrepare };

import { emitDelegation, emitActivity, eventBus, initEventLog } from '../src/state/events.js';

describe('Events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventBus.removeAllListeners();
  });

  describe('emitDelegation', () => {
    it('emits delegation event', () => {
      const spy = vi.fn();
      eventBus.on('delegation', spy);

      const event = {
        taskId: 't1',
        from: 'u1',
        to: 'u2',
        prompt: 'do work',
        priority: 'high',
        createdAt: Date.now()
      };

      emitDelegation(event);

      expect(spy).toHaveBeenCalledWith(event);
    });
  });

  describe('emitActivity', () => {
    it('emits activity event without DB when not initialized', () => {
      const spy = vi.fn();
      eventBus.on('activity', spy);

      const message = 'something happened';
      emitActivity('SYSTEM', message, { foo: 'bar' });

      // Check emission
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'activity',
        category: 'SYSTEM',
        message,
        metadata: { foo: 'bar' }
      }));

      // DB not called when not initialized
      expect(mockPrepare).not.toHaveBeenCalled();
    });

    it('emits activity event and persists to DB when initialized', () => {
      // Initialize with mock DB
      initEventLog(mockDb as any);

      const spy = vi.fn();
      eventBus.on('activity', spy);

      const message = 'something happened';
      emitActivity('SYSTEM', message, { foo: 'bar' });

      // Check emission
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'activity',
        category: 'SYSTEM',
        message,
        metadata: { foo: 'bar' }
      }));

      // Check DB persistence
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO logs'));
    });

    it('handles DB errors gracefully', () => {
      const errorPrepare = vi.fn(() => ({
        run: vi.fn(() => { throw new Error('DB Error'); })
      }));
      initEventLog({ prepare: errorPrepare } as any);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      emitActivity('SYSTEM', 'test error');

      expect(consoleSpy).toHaveBeenCalled();
      expect(errorPrepare).toHaveBeenCalled();
    });
  });
});
