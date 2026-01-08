import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the database before importing queue
vi.mock('../src/state/db.js', () => {
  const mockPrepare = vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn().mockReturnValue([])
  });

  return {
    db: {
      prepare: mockPrepare,
      exec: vi.fn()
    }
  };
});

import { TaskQueue } from '../src/state/queue.js';
import { Task } from '@opensourcewtf/waaah-types';
import { db } from '../src/state/db.js';

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    command: 'execute_prompt',
    prompt: 'Test prompt',
    from: { type: 'user', id: 'test-user', name: 'Test User' },
    to: { role: 'developer' },
    priority: 'normal',
    status: 'QUEUED',
    createdAt: Date.now(),
    ...overrides
  };
}

describe('HybridScheduler', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new TaskQueue();
  });

  afterEach(() => {
    vi.useRealTimers();
    queue.stopScheduler();
  });

  describe('requeueStuckTasks', () => {
    it('requeues tasks stuck in PENDING_ACK for > 60s', () => {
      const task = mockTask({ id: 'stuck-task' });
      queue.enqueue(task);

      // Manually set to PENDING_ACK with old timestamp
      queue['tasks'].get('stuck-task')!.status = 'PENDING_ACK';
      queue['pendingAcks'].set('stuck-task', {
        taskId: 'stuck-task',
        agentId: 'agent-1',
        sentAt: Date.now() - 61000 // 61s ago
      });

      // Run private method via any cast or just run cycle
      // @ts-ignore
      queue.requeueStuckTasks();

      const updated = queue.getTask('stuck-task');
      expect(updated?.status).toBe('QUEUED');
      expect(queue['pendingAcks'].has('stuck-task')).toBe(false);
    });

    it('ignores tasks in PENDING_ACK for < 60s', () => {
      const task = mockTask({ id: 'fresh-task' });
      queue.enqueue(task);

      queue['tasks'].get('fresh-task')!.status = 'PENDING_ACK';
      queue['pendingAcks'].set('fresh-task', {
        taskId: 'fresh-task',
        agentId: 'agent-1',
        sentAt: Date.now() - 10000 // 10s ago
      });

      // @ts-ignore
      queue.requeueStuckTasks();

      const updated = queue.getTask('fresh-task');
      expect(updated?.status).toBe('PENDING_ACK');
    });
  });

  describe('assignHighPriorityTasks', () => {
    it('proactively assigns high priority tasks to waiting agents', async () => {
      const task = mockTask({
        id: 'high-prio-task',
        priority: 'high',
        to: { role: 'developer' }
      });
      queue.enqueue(task);

      // Verify task is QUEUED
      expect(queue.getTask('high-prio-task')?.status).toBe('QUEUED');

      // Start an agent waiting
      const waitPromise = queue.waitForTask('agent-1', 'developer', 10000);

      // Trigger assignment manually
      // @ts-ignore
      queue.assignHighPriorityTasks();

      const assignedTask = await waitPromise;
      expect(assignedTask).not.toBeNull();
      if (assignedTask && 'id' in assignedTask) {
        expect(assignedTask.id).toBe('high-prio-task');
      } else {
        throw new Error('Expected Task but got null or signal');
      }
    });

    it('respects role matching for high priority tasks', async () => {
      const task = mockTask({
        id: 'high-prio-tester-task',
        priority: 'high',
        to: { role: 'test-engineer' }
      });
      queue.enqueue(task);

      // Developer waiting should NOT get it
      const devWaitPromise = queue.waitForTask('dev-agent', 'developer', 1000);

      // Tester waiting should get it
      const testerWaitPromise = queue.waitForTask('test-agent', 'test-engineer', 1000);

      // @ts-ignore
      queue.assignHighPriorityTasks();

      const testerResult = await testerWaitPromise;
      if (testerResult && 'id' in testerResult) {
        expect(testerResult.id).toBe('high-prio-tester-task');
      } else {
        throw new Error('Expected Task but got null or signal');
      }

      // Advance time to force timeout for dev
      vi.advanceTimersByTime(2000);
      const devResult = await devWaitPromise;
      expect(devResult).toBeNull();
    });
  });

  describe('rebalanceOrphanedTasks', () => {
    it('requeues tasks from agents offline for > 5 mins', () => {
      const task = mockTask({
        id: 'orphan-task',
        status: 'ASSIGNED',
        to: { agentId: 'offline-agent', role: 'developer' },
        assignedTo: 'offline-agent'
      });
      queue.enqueue(task);
      // Force status (enqueue sets to QUEUED)
      queue.updateStatus('orphan-task', 'ASSIGNED');

      // Mock DB response for getBusyAgentIds -> agents query
      const mockPrepare = db.prepare as any;
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { id: 'offline-agent', lastSeen: Date.now() - (6 * 60 * 1000) } // 6 mins ago
        ])
      });

      // @ts-ignore
      queue.rebalanceOrphanedTasks();

      const updated = queue.getTask('orphan-task');
      expect(updated?.status).toBe('QUEUED');
      expect(updated?.assignedTo).toBeUndefined();
    });

    it('ignores agents seen recently', () => {
      const task = mockTask({
        id: 'active-task',
        status: 'ASSIGNED',
        to: { agentId: 'active-agent', role: 'developer' },
        assignedTo: 'active-agent'
      });
      queue.enqueue(task);
      queue.updateStatus('active-task', 'ASSIGNED');

      const mockPrepare = db.prepare as any;
      mockPrepare.mockReturnValue({
        all: vi.fn().mockReturnValue([
          { id: 'active-agent', lastSeen: Date.now() - (1 * 60 * 1000) } // 1 min ago
        ])
      });

      // @ts-ignore
      queue.rebalanceOrphanedTasks();

      const updated = queue.getTask('active-task');
      expect(updated?.status).toBe('ASSIGNED');
    });
  });
  describe('getAssignedTasksForAgent', () => {
    it('respects assignedTo field over legacy check', () => {
      const task = mockTask({
        id: 'reassigned-task',
        status: 'ASSIGNED',
        to: { agentId: 'original-agent', role: 'developer' },
        assignedTo: 'new-agent'
      });
      queue.enqueue(task);
      // Force status
      queue.updateStatus('reassigned-task', 'ASSIGNED');

      const originalTasks = queue.getAssignedTasksForAgent('original-agent');
      const newTasks = queue.getAssignedTasksForAgent('new-agent');

      expect(originalTasks).toHaveLength(0);
      expect(newTasks).toHaveLength(1);
      expect(newTasks[0].id).toBe('reassigned-task');
    });
  });
});
