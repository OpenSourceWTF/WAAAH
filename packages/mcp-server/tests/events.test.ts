import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockPrepare, mockRun } = vi.hoisted(() => {
  const mockRun = vi.fn();
  const mockPrepare = vi.fn(() => ({ run: mockRun }));
  return { mockPrepare, mockRun };
});

vi.mock('../src/state/db.js', () => ({
  db: {
    prepare: mockPrepare
  }
}));

import { emitDelegation, emitActivity, eventBus } from '../src/state/events.js';

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
    it('emits activity event and persists to DB', () => {
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
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(Number),
        'SYSTEM',
        message,
        JSON.stringify({ foo: 'bar' })
      );
    });

    it('handles DB errors gracefully', () => {
      mockRun.mockImplementationOnce(() => { throw new Error('DB Error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      emitActivity('SYSTEM', 'test error');

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockPrepare).toHaveBeenCalled();
    });
  });
});
