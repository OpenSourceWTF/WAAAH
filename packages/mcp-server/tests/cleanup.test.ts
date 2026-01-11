/**
 * Cleanup Tests
 * 
 * Tests for periodic agent cleanup logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCleanupInterval } from '../src/lifecycle/cleanup.js';

describe('startCleanupInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an interval that calls cleanup periodically', () => {
    const mockRegistry = {
      getAll: vi.fn().mockReturnValue([]),
      cleanup: vi.fn()
    };
    const mockQueue = {
      getBusyAgentIds: vi.fn().mockReturnValue([]),
      getWaitingAgents: vi.fn().mockReturnValue(new Map())
    };

    const interval = startCleanupInterval(mockRegistry as any, mockQueue as any, 1000);

    expect(interval).toBeDefined();

    // Advance time
    vi.advanceTimersByTime(1000);

    expect(mockRegistry.getAll).toHaveBeenCalled();
    expect(mockQueue.getBusyAgentIds).toHaveBeenCalled();
    expect(mockRegistry.cleanup).toHaveBeenCalled();

    clearInterval(interval);
  });

  it('protects busy and waiting agents from cleanup', () => {
    const mockRegistry = {
      getAll: vi.fn().mockReturnValue([
        { id: 'busy-agent', displayName: '@Busy', lastSeen: Date.now() - 100000 },
        { id: 'waiting-agent', displayName: '@Waiting', lastSeen: Date.now() - 100000 },
        { id: 'idle-agent', displayName: '@Idle', lastSeen: Date.now() - 100000 }
      ]),
      cleanup: vi.fn()
    };
    const mockQueue = {
      getBusyAgentIds: vi.fn().mockReturnValue(['busy-agent']),
      getWaitingAgents: vi.fn().mockReturnValue(new Map([['waiting-agent', []]]))
    };

    const interval = startCleanupInterval(mockRegistry as any, mockQueue as any, 1000);

    vi.advanceTimersByTime(1000);

    // cleanup should be called with protected agents
    expect(mockRegistry.cleanup).toHaveBeenCalledWith(
      1000,
      expect.any(Set)
    );

    const callArgs = mockRegistry.cleanup.mock.calls[0];
    const protectedSet = callArgs[1] as Set<string>;
    expect(protectedSet.has('busy-agent')).toBe(true);
    expect(protectedSet.has('waiting-agent')).toBe(true);

    clearInterval(interval);
  });
});
