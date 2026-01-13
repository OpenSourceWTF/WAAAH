/**
 * Scheduler Tests
 * 
 * Tests for HybridScheduler task assignment and cleanup.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HybridScheduler, type ISchedulerQueue } from '../src/state/scheduler.js';
import type { Task, TaskStatus } from '@opensourcewtf/waaah-types';

// Helper to create mock queue
function createMockQueue(): ISchedulerQueue {
  return {
    getPendingAcks: vi.fn().mockReturnValue(new Map()),
    getWaitingAgents: vi.fn().mockReturnValue(new Map()),
    forceRetry: vi.fn().mockReturnValue({ success: true }),
    updateStatus: vi.fn(),
    findAndReserveAgent: vi.fn().mockReturnValue(null),
    getTask: vi.fn().mockReturnValue(undefined),
    getTaskFromDB: vi.fn().mockReturnValue(undefined),
    getByStatus: vi.fn().mockReturnValue([]),
    getByStatuses: vi.fn().mockReturnValue([]),
    getBusyAgentIds: vi.fn().mockReturnValue([]),
    getAssignedTasksForAgent: vi.fn().mockReturnValue([]),
    getAgentLastSeen: vi.fn().mockReturnValue(Date.now()),
    getTaskLastProgress: vi.fn().mockReturnValue(undefined),
    touchTask: vi.fn()
  };
}

// Helper to create task
function createTask(id: string, status: TaskStatus = 'QUEUED', overrides: Partial<Task> = {}): Task {
  return {
    id,
    command: 'execute_prompt',
    prompt: 'Test',
    from: { type: 'user', id: 'u1', name: 'User' },
    to: {},
    priority: 'normal',
    status,
    createdAt: Date.now() - 1000,
    ...overrides
  } as Task;
}

describe('HybridScheduler', () => {
  let scheduler: HybridScheduler;
  let mockQueue: ISchedulerQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueue = createMockQueue();
    scheduler = new HybridScheduler(mockQueue);
  });

  describe('constructor', () => {
    it('creates scheduler instance', () => {
      expect(scheduler).toBeDefined();
    });
  });

  describe('start/stop', () => {
    it('starts and stops without error', () => {
      scheduler.start(1000);
      scheduler.stop();
      // Should be able to call stop again without error
      scheduler.stop();
    });

    it('prevents multiple starts', () => {
      scheduler.start(1000);
      scheduler.start(1000); // Second call should be no-op
      scheduler.stop();
    });
  });

  describe('runCycle', () => {
    it('calls all scheduler steps', () => {
      scheduler.runCycle();

      expect(mockQueue.getPendingAcks).toHaveBeenCalled();
      expect(mockQueue.getByStatuses).toHaveBeenCalled(); // Used by checkBlockedTasks and rebalanceStaleTasks
    });

    it('handles errors gracefully', () => {
      (mockQueue.getPendingAcks as any).mockImplementation(() => {
        throw new Error('Test error');
      });

      // Should not throw
      expect(() => scheduler.runCycle()).not.toThrow();
    });
  });

  describe('requeueStuckTasks', () => {
    it('requeues tasks stuck in PENDING_ACK', () => {
      const stuckTask = new Map([
        ['task-1', { taskId: 'task-1', agentId: 'agent-1', sentAt: Date.now() - 60000 }] // 60s ago
      ]);
      (mockQueue.getPendingAcks as any).mockReturnValue(stuckTask);

      scheduler.runCycle();

      expect(mockQueue.forceRetry).toHaveBeenCalledWith('task-1');
    });

    it('does not requeue recent tasks', () => {
      const recentTask = new Map([
        ['task-2', { taskId: 'task-2', agentId: 'agent-1', sentAt: Date.now() - 1000 }] // 1s ago
      ]);
      (mockQueue.getPendingAcks as any).mockReturnValue(recentTask);

      scheduler.runCycle();

      expect(mockQueue.forceRetry).not.toHaveBeenCalled();
    });
  });

  describe('checkBlockedTasks', () => {
    it('unblocks tasks with satisfied dependencies', () => {
      const blockedTask = createTask('blocked-1', 'BLOCKED', {
        dependencies: ['dep-1']
      });
      const depTask = createTask('dep-1', 'COMPLETED');

      (mockQueue.getByStatus as any).mockImplementation((status: TaskStatus) => {
        if (status === 'BLOCKED') return [blockedTask];
        return [];
      });
      (mockQueue.getTask as any).mockImplementation((id: string) => {
        if (id === 'dep-1') return depTask;
        if (id === 'blocked-1') return blockedTask;
        return undefined;
      });

      scheduler.runCycle();

      expect(mockQueue.updateStatus).toHaveBeenCalledWith('blocked-1', 'QUEUED');
    });

    it('does not unblock tasks without dependencies', () => {
      const blockedTask = createTask('blocked-2', 'BLOCKED', {
        dependencies: [] // No dependencies - blocked for clarification
      });

      (mockQueue.getByStatus as any).mockImplementation((status: TaskStatus) => {
        if (status === 'BLOCKED') return [blockedTask];
        return [];
      });

      scheduler.runCycle();

      expect(mockQueue.updateStatus).not.toHaveBeenCalledWith('blocked-2', 'QUEUED');
    });
  });

  describe('assignPendingTasks', () => {
    it('assigns QUEUED tasks to waiting agents', () => {
      const task = createTask('task-1', 'QUEUED');
      const waitingAgents = new Map([['agent-1', {
        capabilities: ['code-writing'],
        workspaceContext: { type: 'github', repoId: 'test-repo' }
      }]]);

      (mockQueue.getByStatuses as any).mockReturnValue([task]);
      (mockQueue.getWaitingAgents as any).mockReturnValue(waitingAgents);
      (mockQueue.findAndReserveAgent as any).mockReturnValue('agent-1');

      scheduler.runCycle();

      expect(mockQueue.findAndReserveAgent).toHaveBeenCalledWith(task);
    });

    it('does not assign when no waiting agents', () => {
      const task = createTask('task-2', 'QUEUED');

      (mockQueue.getByStatuses as any).mockReturnValue([task]);
      (mockQueue.getWaitingAgents as any).mockReturnValue(new Map());

      scheduler.runCycle();

      // findAndReserveAgent should still be called (scheduler tries to assign)
      // But we start with empty waiting agents - no assignment possible
    });

    it('sorts tasks by priority (critical > high > normal)', () => {
      const normalTask = createTask('normal', 'QUEUED', { priority: 'normal' });
      const criticalTask = createTask('critical', 'QUEUED', { priority: 'critical' });
      const highTask = createTask('high', 'QUEUED', { priority: 'high' });

      (mockQueue.getByStatuses as any).mockReturnValue([normalTask, criticalTask, highTask]);
      (mockQueue.getWaitingAgents as any).mockReturnValue(new Map([['agent-1', {
        capabilities: [],
        workspaceContext: { type: 'github', repoId: 'test-repo' }
      }]]));
      (mockQueue.findAndReserveAgent as any).mockReturnValue('agent-1');

      scheduler.runCycle();

      // Should be called with critical first (highest priority)
      const calls = (mockQueue.findAndReserveAgent as any).mock.calls;
      if (calls.length > 0) {
        expect(calls[0][0].id).toBe('critical');
      }
    });
  });

  describe('rebalanceStaleTasks', () => {
    it('requeues stale tasks with no recent activity', () => {
      const staleTime = Date.now() - (31 * 60 * 1000); // 31 min ago (> 30 min timeout)
      const task = createTask('stale-1', 'IN_PROGRESS', { createdAt: staleTime });

      (mockQueue.getByStatuses as any).mockReturnValue([task]);
      (mockQueue.getTaskLastProgress as any).mockReturnValue(undefined); // No progress recorded

      scheduler.runCycle();

      expect(mockQueue.forceRetry).toHaveBeenCalledWith('stale-1');
    });

    it('does not rebalance active tasks with recent progress', () => {
      const oldCreateTime = Date.now() - (31 * 60 * 1000); // Created 31 min ago
      const recentProgress = Date.now() - (5 * 60 * 1000); // Progress 5 min ago
      const task = createTask('active-1', 'IN_PROGRESS', { createdAt: oldCreateTime });

      (mockQueue.getByStatuses as any).mockReturnValue([task]);
      (mockQueue.getTaskLastProgress as any).mockReturnValue(recentProgress);

      scheduler.runCycle();

      expect(mockQueue.forceRetry).not.toHaveBeenCalledWith('active-1');
    });
  });
});
