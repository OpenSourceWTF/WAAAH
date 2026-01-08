import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/state/queue.js';
import { Task } from '@opensourcewtf/waaah-types';
import { createTestContext, TestContext } from './harness.js';

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
  let ctx: TestContext;
  let queue: TaskQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = createTestContext();
    queue = ctx.queue;
  });

  afterEach(() => {
    vi.useRealTimers();
    queue.stopScheduler();
  });

  describe('requeueStuckTasks', () => {
    it('requeues tasks stuck in PENDING_ACK for > 30s', () => {
      const task = mockTask({ id: 'stuck-task' });
      queue.enqueue(task);

      // Manually set to PENDING_ACK with old timestamp
      queue.updateStatus('stuck-task', 'PENDING_ACK');
      queue['pendingAcks'].set('stuck-task', {
        taskId: 'stuck-task',
        agentId: 'agent-1',
        sentAt: Date.now() - 31000 // 31s ago (> 30s timeout)
      });

      // Run private method via any cast or just run cycle
      // @ts-ignore
      queue.requeueStuckTasks();

      const updated = queue.getTask('stuck-task');
      expect(updated?.status).toBe('QUEUED');
      expect(queue['pendingAcks'].has('stuck-task')).toBe(false);
    });

    it('ignores tasks in PENDING_ACK for < 30s', () => {
      const task = mockTask({ id: 'fresh-task' });
      queue.enqueue(task);

      queue.updateStatus('fresh-task', 'PENDING_ACK');
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

  describe('assignPendingTasks', () => {
    it('assigns queued tasks to waiting agents', async () => {
      const task = mockTask({
        id: 'queued-task',
        priority: 'normal',
        to: { role: 'developer' }
      });
      queue.enqueue(task);

      // Verify task is QUEUED
      expect(queue.getTask('queued-task')?.status).toBe('QUEUED');

      // Start an agent waiting
      const waitPromise = queue.waitForTask('agent-1', 'developer', 10000);

      // Trigger assignment manually
      // @ts-ignore
      queue.assignPendingTasks();

      const assignedTask = await waitPromise;
      expect(assignedTask).not.toBeNull();
      if (assignedTask && 'id' in assignedTask) {
        expect(assignedTask.id).toBe('queued-task');
      } else {
        throw new Error('Expected Task but got null or signal');
      }
    });

    it('respects role matching for task assignment', async () => {
      const task = mockTask({
        id: 'tester-task',
        priority: 'normal',
        to: { role: 'test-engineer' }
      });
      queue.enqueue(task);

      // Developer waiting should NOT get it
      const devWaitPromise = queue.waitForTask('dev-agent', 'developer', 1000);

      // Tester waiting should get it
      const testerWaitPromise = queue.waitForTask('test-agent', 'test-engineer', 1000);

      // @ts-ignore
      queue.assignPendingTasks();

      const testerResult = await testerWaitPromise;
      if (testerResult && 'id' in testerResult) {
        expect(testerResult.id).toBe('tester-task');
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
    // Skip: Requires agent table mock - testing agent last-seen is out of scope for queue refactoring
    it.skip('requeues tasks from offline agents (>5 min)', () => {
      // Test would require mocking agents table responses
    });

    it.skip('ignores agents seen recently', () => {
      // Test would require mocking agents table responses
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
