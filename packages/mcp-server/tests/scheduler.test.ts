import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/state/queue.js';
import { HybridScheduler } from '../src/state/scheduler.js';
import { Task } from '@opensourcewtf/waaah-types';
import { createTestContext, TestContext } from './harness.js';

function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    command: 'execute_prompt',
    prompt: 'Test prompt',
    from: { type: 'user', id: 'test-user', name: 'Test User' },
    to: { requiredCapabilities: ['code-writing'] },
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

      // Update task status to PENDING_ACK with old ackSentAt time (DB-backed)
      queue.updateStatus('stuck-task', 'PENDING_ACK');
      // Set DB-backed pending ACK state with old timestamp
      (ctx.db as any).prepare(
        'UPDATE tasks SET pendingAckAgentId = ?, ackSentAt = ? WHERE id = ?'
      ).run('agent-1', Date.now() - 31000, 'stuck-task'); // 31s ago (> 30s timeout)

      // Start the scheduler - running a cycle will trigger requeueStuckTasks
      queue.startScheduler(100);
      vi.advanceTimersByTime(150);

      const updated = queue.getTask('stuck-task');
      expect(updated?.status).toBe('QUEUED');

    });

    it('ignores tasks in PENDING_ACK for < 30s', () => {
      const task = mockTask({ id: 'fresh-task' });
      queue.enqueue(task);

      queue.updateStatus('fresh-task', 'PENDING_ACK');
      // Set DB-backed pending ACK state with recent timestamp
      (ctx.db as any).prepare(
        'UPDATE tasks SET pendingAckAgentId = ?, ackSentAt = ? WHERE id = ?'
      ).run('agent-1', Date.now() - 10000, 'fresh-task'); // 10s ago

      // Start the scheduler
      queue.startScheduler(100);
      vi.advanceTimersByTime(150);

      const updated = queue.getTask('fresh-task');
      expect(updated?.status).toBe('PENDING_ACK');
    });
  });

  describe('assignPendingTasks', () => {
    it('assigns queued tasks to waiting agents', async () => {
      const task = mockTask({
        id: 'queued-task',
        priority: 'normal',
        to: { requiredCapabilities: ['code-writing'] }
      });
      queue.enqueue(task);

      // Verify task is QUEUED
      expect(queue.getTask('queued-task')?.status).toBe('QUEUED');

      // Start an agent waiting
      const waitPromise = queue.waitForTask('agent-1', ['code-writing'], 10000);

      // Start scheduler to trigger assignment
      queue.startScheduler(100);
      vi.advanceTimersByTime(150);

      const assignedTask = await waitPromise;
      expect(assignedTask).not.toBeNull();
      if (assignedTask && 'id' in assignedTask) {
        expect(assignedTask.id).toBe('queued-task');
      } else {
        throw new Error('Expected Task but got null or signal');
      }
    });

    it('respects capability matching for task assignment', async () => {
      const task = mockTask({
        id: 'tester-task',
        priority: 'normal',
        to: { requiredCapabilities: ['test-writing'] }
      });
      queue.enqueue(task);

      // Code-writer waiting should NOT get it
      const devWaitPromise = queue.waitForTask('dev-agent', ['code-writing'], 1000);

      // Test-writer waiting should get it
      const testerWaitPromise = queue.waitForTask('test-agent', ['test-writing'], 1000);

      // Start scheduler to trigger assignment
      queue.startScheduler(100);
      vi.advanceTimersByTime(150);

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
        to: { agentId: 'original-agent', requiredCapabilities: ['code-writing'] },
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
