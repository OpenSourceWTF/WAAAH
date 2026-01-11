/**
 * Task Lifecycle Service Tests
 * 
 * Tests for dependency checking and task lifecycle operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { areDependenciesMet, TaskLifecycleService } from '../src/state/services/task-lifecycle-service.js';
import type { Task } from '@opensourcewtf/waaah-types';

// Helper to create task
function createTask(id: string, status: string = 'QUEUED', dependencies?: string[]): Task {
  return {
    id,
    command: 'execute_prompt',
    prompt: 'Test',
    from: { type: 'user', id: 'u1', name: 'User' },
    to: {},
    priority: 'normal',
    status,
    createdAt: Date.now(),
    dependencies
  } as Task;
}

describe('areDependenciesMet', () => {
  it('returns true when task has no dependencies', () => {
    const task = createTask('task-1');
    const getTask = vi.fn();

    expect(areDependenciesMet(task, getTask)).toBe(true);
    expect(getTask).not.toHaveBeenCalled();
  });

  it('returns true when task has empty dependencies array', () => {
    const task = createTask('task-1', 'QUEUED', []);
    const getTask = vi.fn();

    expect(areDependenciesMet(task, getTask)).toBe(true);
  });

  it('returns true when all dependencies are COMPLETED', () => {
    const task = createTask('task-1', 'QUEUED', ['dep-1', 'dep-2']);
    const dep1 = createTask('dep-1', 'COMPLETED');
    const dep2 = createTask('dep-2', 'COMPLETED');

    const getTask = (id: string) => {
      if (id === 'dep-1') return dep1;
      if (id === 'dep-2') return dep2;
      return undefined;
    };

    expect(areDependenciesMet(task, getTask)).toBe(true);
  });

  it('returns false when a dependency is not COMPLETED', () => {
    const task = createTask('task-1', 'QUEUED', ['dep-1', 'dep-2']);
    const dep1 = createTask('dep-1', 'COMPLETED');
    const dep2 = createTask('dep-2', 'IN_PROGRESS');

    const getTask = (id: string) => {
      if (id === 'dep-1') return dep1;
      if (id === 'dep-2') return dep2;
      return undefined;
    };

    expect(areDependenciesMet(task, getTask)).toBe(false);
  });

  it('returns false when a dependency is not found', () => {
    const task = createTask('task-1', 'QUEUED', ['dep-1', 'dep-missing']);
    const dep1 = createTask('dep-1', 'COMPLETED');

    const getTask = (id: string) => {
      if (id === 'dep-1') return dep1;
      return undefined;
    };

    expect(areDependenciesMet(task, getTask)).toBe(false);
  });
});

describe('TaskLifecycleService', () => {
  let service: TaskLifecycleService;
  let mockRepo: any;
  let mockMatchingService: any;
  let mockPersistence: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn()
    };

    mockMatchingService = {
      reserveAgentForTask: vi.fn().mockReturnValue(null)
    };

    mockPersistence = {
      getPendingAck: vi.fn(),
      clearPendingAck: vi.fn(),
      setPendingAck: vi.fn()
    };

    service = new TaskLifecycleService(mockRepo, mockMatchingService, mockPersistence);
  });

  describe('enqueue', () => {
    it('enqueues task with QUEUED status', () => {
      const task = createTask('task-1', 'QUEUED');
      mockRepo.getById.mockReturnValue(undefined);

      service.enqueue(task);

      expect(mockRepo.insert).toHaveBeenCalledWith(task);
      expect(mockMatchingService.reserveAgentForTask).toHaveBeenCalledWith(task);
    });

    it('blocks task if dependencies not met', () => {
      const task = createTask('task-1', 'QUEUED', ['dep-1']);
      const dep = createTask('dep-1', 'IN_PROGRESS'); -
        mockRepo.getById.mockImplementation((id: string) => {
          if (id === 'dep-1') return dep;
          return undefined;
        });

      service.enqueue(task);

      expect(task.status).toBe('BLOCKED');
    });
  });

  describe('updateStatus', () => {
    it('updates task status', () => {
      const task = createTask('task-1', 'QUEUED');
      mockRepo.getById.mockReturnValue(task);

      const result = service.updateStatus('task-1', 'COMPLETED', { message: 'Done' });

      expect(result?.status).toBe('COMPLETED');
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('returns null for non-existent task', () => {
      mockRepo.getById.mockReturnValue(undefined);

      const result = service.updateStatus('nonexistent', 'COMPLETED');

      expect(result).toBeNull();
    });
  });

  describe('cancelTask', () => {
    it('cancels task and clears pending ack', () => {
      const task = createTask('task-1', 'QUEUED');
      mockRepo.getById.mockReturnValue(task);

      const result = service.cancelTask('task-1');

      expect(result.success).toBe(true);
      expect(mockPersistence.clearPendingAck).toHaveBeenCalledWith('task-1');
    });

    it('fails for already completed task', () => {
      const task = createTask('task-1', 'COMPLETED');
      mockRepo.getById.mockReturnValue(task);

      const result = service.cancelTask('task-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('already COMPLETED');
    });

    it('fails for non-existent task', () => {
      mockRepo.getById.mockReturnValue(undefined);

      const result = service.cancelTask('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Task not found');
    });
  });

  describe('forceRetry', () => {
    it('retries task by resetting to QUEUED', () => {
      const task = createTask('task-1', 'FAILED');
      mockRepo.getById.mockReturnValue(task);

      const result = service.forceRetry('task-1');

      expect(result.success).toBe(true);
      expect(task.status).toBe('QUEUED');
      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('fails for non-retryable status', () => {
      const task = createTask('task-1', 'QUEUED'); // Already QUEUED, not in RETRYABLE_STATES
      mockRepo.getById.mockReturnValue(task);

      const result = service.forceRetry('task-1');

      expect(result.success).toBe(false);
    });

    it('preserves diff artifacts across retries', () => {
      const task = createTask('task-1', 'FAILED') as any;
      task.response = { artifacts: { diff: 'preserved-diff-data' } };
      mockRepo.getById.mockReturnValue(task);

      service.forceRetry('task-1');

      expect(task.response?.artifacts?.diff).toBe('preserved-diff-data');
    });
  });

  describe('ackTask', () => {
    it('acknowledges task from PENDING_ACK to ASSIGNED', () => {
      const task = createTask('task-1', 'PENDING_ACK');
      mockRepo.getById.mockReturnValue(task);
      mockPersistence.getPendingAck.mockReturnValue({ taskId: 'task-1', agentId: 'agent-1', sentAt: Date.now() });

      const result = service.ackTask('task-1', 'agent-1');

      expect(result.success).toBe(true);
      expect(task.assignedTo).toBe('agent-1');
    });

    it('fails if task not in PENDING_ACK', () => {
      const task = createTask('task-1', 'QUEUED');
      mockRepo.getById.mockReturnValue(task);

      const result = service.ackTask('task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in PENDING_ACK');
    });

    it('fails if agent does not match pending ack', () => {
      const task = createTask('task-1', 'PENDING_ACK');
      mockRepo.getById.mockReturnValue(task);
      mockPersistence.getPendingAck.mockReturnValue({ taskId: 'task-1', agentId: 'other-agent', sentAt: Date.now() });

      const result = service.ackTask('task-1', 'agent-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected agent');
    });
  });
});
