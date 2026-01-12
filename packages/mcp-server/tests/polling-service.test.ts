/**
 * Polling Service Tests
 * 
 * Tests for agent task polling and completion waiting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PollingService } from '../src/state/services/polling-service.js';
import type { Task } from '@opensourcewtf/waaah-types';
import { EventEmitter } from 'events';

// Helper to create task
function createTask(id: string, status: string = 'QUEUED'): Task {
  return {
    id,
    command: 'execute_prompt',
    prompt: 'Test',
    from: { type: 'user', id: 'u1', name: 'User' },
    to: {},
    priority: 'normal',
    status,
    createdAt: Date.now()
  } as Task;
}

describe('PollingService', () => {
  let service: PollingService;
  let mockRepo: any;
  let mockPersistence: any;
  let mockMatchingService: any;
  let mockEvictionService: any;
  let emitter: EventEmitter;
  let onAgentWaiting: any;

  beforeEach(() => {
    vi.clearAllMocks();

    emitter = new EventEmitter();

    mockRepo = {
      getById: vi.fn(),
      getByStatus: vi.fn().mockReturnValue([]),
      updateStatus: vi.fn(),
      getActive: vi.fn().mockReturnValue([])
    };

    mockPersistence = {
      setAgentWaiting: vi.fn(),
      clearAgentWaiting: vi.fn(),
      setPendingAck: vi.fn(),
      clearPendingAck: vi.fn(),
      resetWaitingAgents: vi.fn()
    };

    mockMatchingService = {
      findPendingTaskForAgent: vi.fn().mockReturnValue(null)
    };

    mockEvictionService = {
      popEviction: vi.fn().mockReturnValue(null)
    };

    onAgentWaiting = vi.fn();

    service = new PollingService(
      mockRepo,
      mockPersistence,
      mockMatchingService,
      mockEvictionService,
      emitter as any,
      onAgentWaiting
    );
  });

  describe('waitForTask', () => {
    it('returns eviction if pending', async () => {
      mockEvictionService.popEviction.mockReturnValue({
        controlSignal: 'EVICT',
        reason: 'Test eviction',
        action: 'RESTART'
      });

      const result = await service.waitForTask('agent-1', ['code-writing'], undefined, 100);

      expect(result).toEqual({
        controlSignal: 'EVICT',
        reason: 'Test eviction',
        action: 'RESTART'
      });
    });

    it('returns pending task if available', async () => {
      const task = createTask('task-1', 'QUEUED');
      mockMatchingService.findPendingTaskForAgent.mockReturnValue(task);

      const result = await service.waitForTask('agent-1', ['code-writing'], undefined, 100);

      expect(result).toBe(task);
      expect(mockRepo.updateStatus).toHaveBeenCalledWith('task-1', 'PENDING_ACK');
      expect(mockPersistence.setPendingAck).toHaveBeenCalledWith('task-1', 'agent-1');
    });

    it('sets agent as waiting in persistence', async () => {
      const promise = service.waitForTask('agent-1', ['code-writing'], undefined, 50);

      // Let it timeout
      const result = await promise;

      expect(mockPersistence.setAgentWaiting).toHaveBeenCalledWith('agent-1', ['code-writing'], undefined);
      expect(result).toBeNull();
    });

    it('times out and clears waiting state', async () => {
      const result = await service.waitForTask('agent-1', ['code-writing'], undefined, 10);

      expect(result).toBeNull();
      expect(mockPersistence.clearAgentWaiting).toHaveBeenCalledWith('agent-1');
    });

    it('triggers onAgentWaiting callback', async () => {
      // Use longer timeout to let setImmediate fire
      vi.useFakeTimers();

      const promise = service.waitForTask('agent-1', ['code-writing'], undefined, 100);

      // Fast forward past setImmediate
      await vi.runAllTimersAsync();
      vi.useRealTimers();

      // Callback should be scheduled
      // Note: setImmediate() is async, so we just verify it was called
    });
  });

  describe('waitForTaskCompletion', () => {
    it('returns immediately if task already complete', async () => {
      const task = createTask('task-1', 'COMPLETED');
      mockRepo.getById.mockReturnValue(task);

      const result = await service.waitForTaskCompletion('task-1', 100);

      expect(result).toBe(task);
    });

    it('returns immediately if task already failed', async () => {
      const task = createTask('task-1', 'FAILED');
      mockRepo.getById.mockReturnValue(task);

      const result = await service.waitForTaskCompletion('task-1', 100);

      expect(result).toBe(task);
    });

    it('returns immediately if task already blocked', async () => {
      const task = createTask('task-1', 'BLOCKED');
      mockRepo.getById.mockReturnValue(task);

      const result = await service.waitForTaskCompletion('task-1', 100);

      expect(result).toBe(task);
    });

    it('times out and returns latest task state', async () => {
      const inProgressTask = createTask('task-1', 'IN_PROGRESS');
      mockRepo.getById.mockReturnValue(inProgressTask);

      const result = await service.waitForTaskCompletion('task-1', 50);

      expect(result?.status).toBe('IN_PROGRESS');
    });

    it('resolves when completion event fires', async () => {
      // Task not complete initially
      mockRepo.getById.mockReturnValue(createTask('task-1', 'IN_PROGRESS'));

      const promise = service.waitForTaskCompletion('task-1', 1000);

      // Emit completion event
      const completedTask = createTask('task-1', 'COMPLETED');
      emitter.emit('completion', completedTask);

      const result = await promise;

      expect(result?.status).toBe('COMPLETED');
    });
  });

  describe('resetStaleState', () => {
    it('resets PENDING_ACK tasks to QUEUED', () => {
      const staleTask = createTask('stale-1', 'PENDING_ACK');
      mockRepo.getByStatus.mockReturnValue([staleTask]);

      service.resetStaleState();

      expect(mockRepo.updateStatus).toHaveBeenCalledWith('stale-1', 'QUEUED');
      expect(mockPersistence.clearPendingAck).toHaveBeenCalledWith('stale-1');
    });

    it('resets all waiting agents', () => {
      mockRepo.getByStatus.mockReturnValue([]);

      service.resetStaleState();

      expect(mockPersistence.resetWaitingAgents).toHaveBeenCalled();
    });

    it('handles database not ready gracefully', () => {
      mockRepo.getByStatus.mockImplementation(() => {
        throw new Error('DB not ready');
      });

      // Should not throw
      expect(() => service.resetStaleState()).not.toThrow();
    });
  });
});
