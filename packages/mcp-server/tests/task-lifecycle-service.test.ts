import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskLifecycleService } from '../src/state/services/task-lifecycle-service.js';
import { ITaskRepository } from '../src/state/task-repository.js';
import { AgentMatchingService } from '../src/state/services/agent-matching-service.js';
import { QueuePersistence } from '../src/state/persistence/queue-persistence.js';
import { Task } from '@opensourcewtf/waaah-types';

describe('TaskLifecycleService', () => {
  let service: TaskLifecycleService;
  let repo: ITaskRepository;
  let matchingService: AgentMatchingService;
  let persistence: QueuePersistence;

  beforeEach(() => {
    repo = {
      getById: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
    } as unknown as ITaskRepository;

    matchingService = {
      reserveAgentForTask: vi.fn(),
    } as unknown as AgentMatchingService;

    persistence = {
      clearPendingAck: vi.fn(),
      getPendingAck: vi.fn(),
    } as unknown as QueuePersistence;

    service = new TaskLifecycleService(repo, matchingService, persistence);
  });

  function mockTask(overrides: Partial<Task> = {}): Task {
    return {
      id: 'task-1',
      status: 'QUEUED',
      command: 'test',
      prompt: 'test prompt',
      priority: 'normal',
      from: { type: 'user', id: 'user1', name: 'User' },
      to: { requiredCapabilities: [] },
      history: [],
      createdAt: Date.now(),
      ...overrides
    };
  }

  describe('enqueue', () => {
    it('should insert task and reserve agent', () => {
      const task = mockTask();
      vi.mocked(matchingService.reserveAgentForTask).mockReturnValue('agent-1');

      const result = service.enqueue(task);

      expect(repo.insert).toHaveBeenCalledWith(task);
      expect(matchingService.reserveAgentForTask).toHaveBeenCalledWith(task);
      expect(result).toBe('agent-1');
    });

    it('should check dependencies and block if not met', () => {
      const depTask = mockTask({ id: 'dep-1', status: 'QUEUED' });
      const task = mockTask({ dependencies: ['dep-1'] });
      
      vi.mocked(repo.getById).mockReturnValue(depTask);

      service.enqueue(task);

      expect(task.status).toBe('BLOCKED');
      expect(repo.insert).toHaveBeenCalledWith(task);
    });

    it('should not block if dependencies met', () => {
      const depTask = mockTask({ id: 'dep-1', status: 'COMPLETED' });
      const task = mockTask({ dependencies: ['dep-1'] });
      
      vi.mocked(repo.getById).mockReturnValue(depTask);

      service.enqueue(task);

      expect(task.status).toBe('QUEUED');
    });
  });

  describe('updateStatus', () => {
    it('should update status and record history', () => {
      const task = mockTask();
      vi.mocked(repo.getById).mockReturnValue(task);

      service.updateStatus('task-1', 'IN_PROGRESS');

      expect(task.status).toBe('IN_PROGRESS');
      expect(task.history).toHaveLength(1);
      expect(task.history?.[0].status).toBe('IN_PROGRESS');
      expect(repo.update).toHaveBeenCalledWith(task);
    });

    it('should handle response and completion', () => {
      const task = mockTask();
      vi.mocked(repo.getById).mockReturnValue(task);

      service.updateStatus('task-1', 'COMPLETED', { result: 'done' });

      expect(task.status).toBe('COMPLETED');
      expect(task.response).toEqual({ result: 'done' });
      expect(task.completedAt).toBeDefined();
    });

    it('should return null if task not found', () => {
      vi.mocked(repo.getById).mockReturnValue(null);
      const result = service.updateStatus('task-1', 'COMPLETED');
      expect(result).toBeNull();
    });
  });

  describe('cancelTask', () => {
    it('should cancel task if not terminal', () => {
      const task = mockTask({ status: 'QUEUED' });
      vi.mocked(repo.getById).mockReturnValue(task);

      const result = service.cancelTask('task-1');

      expect(result.success).toBe(true);
      expect(task.status).toBe('CANCELLED'); // updateStatus changes it
      expect(persistence.clearPendingAck).toHaveBeenCalledWith('task-1');
    });

    it('should fail if task not found', () => {
      vi.mocked(repo.getById).mockReturnValue(null);
      const result = service.cancelTask('task-1');
      expect(result.success).toBe(false);
    });

    it('should fail if task is terminal', () => {
      const task = mockTask({ status: 'COMPLETED' });
      vi.mocked(repo.getById).mockReturnValue(task);
      const result = service.cancelTask('task-1');
      expect(result.success).toBe(false);
    });
  });

  describe('forceRetry', () => {
    it('should retry task if retryable', () => {
      const task = mockTask({ status: 'FAILED', assignedTo: 'agent-1', response: 'err' });
      vi.mocked(repo.getById).mockReturnValue(task);

      const result = service.forceRetry('task-1');

      expect(result.success).toBe(true);
      expect(task.status).toBe('QUEUED');
      expect(task.assignedTo).toBeUndefined();
      expect(task.response).toBeUndefined();
      expect(task.history).toHaveLength(1);
      expect(task.history?.[0].status).toBe('QUEUED');
    });

    it('should fail if status not retryable', () => {
      const task = mockTask({ status: 'COMPLETED' });
      vi.mocked(repo.getById).mockReturnValue(task);
      const result = service.forceRetry('task-1');
      expect(result.success).toBe(false);
    });
  });

  describe('ackTask', () => {
    it('should ack task if pending match', () => {
      const task = mockTask({ status: 'PENDING_ACK' });
      vi.mocked(repo.getById).mockReturnValue(task);
      vi.mocked(persistence.getPendingAck).mockReturnValue({ agentId: 'agent-1', sentAt: 123 });

      const result = service.ackTask('task-1', 'agent-1');

      expect(result.success).toBe(true);
      expect(task.status).toBe('ASSIGNED');
      expect(task.assignedTo).toBe('agent-1');
    });

    it('should fail if task not found', () => {
      vi.mocked(repo.getById).mockReturnValue(null);
      const result = service.ackTask('task-1', 'agent-1');
      expect(result.success).toBe(false);
    });

    it('should fail if task not in PENDING_ACK', () => {
      const task = mockTask({ status: 'QUEUED' });
      vi.mocked(repo.getById).mockReturnValue(task);
      const result = service.ackTask('task-1', 'agent-1');
      expect(result.success).toBe(false);
    });

    it('should fail if agent mismatch', () => {
      const task = mockTask({ status: 'PENDING_ACK' });
      vi.mocked(repo.getById).mockReturnValue(task);
      vi.mocked(persistence.getPendingAck).mockReturnValue({ agentId: 'agent-1', sentAt: 123 });

      const result = service.ackTask('task-1', 'agent-2');
      expect(result.success).toBe(false);
    });
  });
});
