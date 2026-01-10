/**
 * LoopDetector Tests
 * 
 * Tests for the agent loop monitoring and detection system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LoopDetector, LoopState } from './loop-detector.js';

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new LoopDetector();
  });

  afterEach(() => {
    detector.stop();
    vi.useRealTimers();
  });

  describe('activity detection', () => {
    it('should detect activity from stdout data', () => {
      const activeHandler = vi.fn();
      detector.on('active', activeHandler);

      detector.processOutput('Some output from the agent');

      expect(activeHandler).toHaveBeenCalled();
      expect(detector.getState()).toBe(LoopState.ACTIVE);
    });

    it('should update lastActivityTime on output', () => {
      const before = detector.getLastActivityTime();
      vi.advanceTimersByTime(1000);
      detector.processOutput('test output');
      const after = detector.getLastActivityTime();

      expect(after.getTime()).toBeGreaterThan(before.getTime());
    });

    it('should track activity state', () => {
      expect(detector.getState()).toBe(LoopState.STARTING);

      detector.processOutput('first output');
      expect(detector.getState()).toBe(LoopState.ACTIVE);
    });
  });

  describe('heartbeat/idle detection', () => {
    it('should fire idle event after 2 minutes of no activity', () => {
      const idleHandler = vi.fn();
      detector.on('idle', idleHandler);

      detector.start();
      detector.processOutput('initial activity');

      // Advance past heartbeat threshold (2 minutes) + one check interval (30s)
      // Check runs every 30s, so at 150s it will detect 120s of inactivity
      vi.advanceTimersByTime(150001);

      expect(idleHandler).toHaveBeenCalled();
      expect(detector.getState()).toBe(LoopState.IDLE);
    });

    it('should not fire idle if activity continues', () => {
      const idleHandler = vi.fn();
      detector.on('idle', idleHandler);

      detector.start();
      detector.processOutput('activity');

      // Activity every 30 seconds
      vi.advanceTimersByTime(30000);
      detector.processOutput('more activity');
      vi.advanceTimersByTime(30000);
      detector.processOutput('more activity');
      vi.advanceTimersByTime(30000);
      detector.processOutput('more activity');

      expect(idleHandler).not.toHaveBeenCalled();
    });

    it('should use custom heartbeat interval', () => {
      const customDetector = new LoopDetector({ heartbeatIntervalMs: 60000 });
      const idleHandler = vi.fn();
      customDetector.on('idle', idleHandler);

      customDetector.start();
      customDetector.processOutput('activity');

      // 60 second threshold + check interval (30s) = 90s should fire idle
      vi.advanceTimersByTime(90001);

      expect(idleHandler).toHaveBeenCalled();
      customDetector.stop();
    });
  });

  describe('loop exit detection', () => {
    it('should detect loop exit patterns in output', () => {
      const loopExitHandler = vi.fn();
      detector.on('loop-exit', loopExitHandler);

      // Common patterns that indicate loop exit
      const exitPatterns = [
        'goodbye',
        'session ended',
        'exiting the loop',
        'agent stopping',
      ];

      detector.processOutput(exitPatterns[0]);

      expect(loopExitHandler).toHaveBeenCalled();
    });

    it('should include reason in loop-exit event', () => {
      const loopExitHandler = vi.fn();
      detector.on('loop-exit', loopExitHandler);

      detector.processOutput('Agent is exiting the loop now');

      expect(loopExitHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          exitDetected: true,
          reason: expect.any(String),
        })
      );
    });

    it('should detect wait_for_prompt timeout patterns', () => {
      const loopExitHandler = vi.fn();
      detector.on('loop-exit', loopExitHandler);

      detector.processOutput('wait_for_prompt timed out');

      expect(loopExitHandler).toHaveBeenCalled();
    });

    it('should not false-positive on normal output', () => {
      const loopExitHandler = vi.fn();
      detector.on('loop-exit', loopExitHandler);

      detector.processOutput('Processing task...');
      detector.processOutput('Running tests...');
      detector.processOutput('Building project...');

      expect(loopExitHandler).not.toHaveBeenCalled();
    });
  });

  describe('event emission', () => {
    it('should support multiple event listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      detector.on('active', handler1);
      detector.on('active', handler2);

      detector.processOutput('test');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should support removing event listeners', () => {
      const handler = vi.fn();

      detector.on('active', handler);
      detector.off('active', handler);

      detector.processOutput('test');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should transition from idle back to active', () => {
      const activeHandler = vi.fn();
      detector.on('active', activeHandler);

      detector.start();
      detector.processOutput('initial');

      // Go idle - need to pass heartbeat (120s) + check interval (30s)
      vi.advanceTimersByTime(150001);
      expect(detector.getState()).toBe(LoopState.IDLE);

      // New activity
      detector.processOutput('new activity');

      expect(detector.getState()).toBe(LoopState.ACTIVE);
      expect(activeHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('lifecycle', () => {
    it('should start monitoring', () => {
      expect(detector.isRunning()).toBe(false);

      detector.start();

      expect(detector.isRunning()).toBe(true);
    });

    it('should stop monitoring', () => {
      detector.start();
      expect(detector.isRunning()).toBe(true);

      detector.stop();

      expect(detector.isRunning()).toBe(false);
    });

    it('should reset state', () => {
      detector.processOutput('activity');
      vi.advanceTimersByTime(130000);

      detector.reset();

      expect(detector.getState()).toBe(LoopState.STARTING);
    });

    it('should not fire events after stop', () => {
      const idleHandler = vi.fn();
      detector.on('idle', idleHandler);

      detector.start();
      detector.processOutput('activity');
      detector.stop();

      vi.advanceTimersByTime(130000);

      expect(idleHandler).not.toHaveBeenCalled();
    });
  });
});
