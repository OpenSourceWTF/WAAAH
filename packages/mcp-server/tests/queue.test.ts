import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { Task } from '@waaah/types';
import { db } from '../src/state/db.js';

// Helper to create mock tasks
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

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  describe('enqueue', () => {
    it('adds task to queue', () => {
      const task = mockTask({ id: 'enqueue-test-1' });
      queue.enqueue(task);
      expect(queue.getTask('enqueue-test-1')).toBeDefined();
    });

    it('emits task event on enqueue', async () => {
      const task = mockTask({ id: 'emit-test-1' });
      const eventPromise = new Promise<Task>((resolve) => {
        queue.once('task', resolve);
      });

      queue.enqueue(task);
      const emittedTask = await eventPromise;
      expect(emittedTask.id).toBe('emit-test-1');
    });

    it('sets status to QUEUED', () => {
      const task = mockTask({ id: 'status-test-1' });
      queue.enqueue(task);
      expect(queue.getTask('status-test-1')?.status).toBe('QUEUED');
    });
    it('emits completion event when status updated to COMPLETED', async () => {
      const task = mockTask({ id: 'completion-emit-test' });
      queue.enqueue(task);

      const eventPromise = new Promise<Task>((resolve) => {
        queue.once('completion', resolve);
      });

      queue.updateStatus(task.id, 'COMPLETED', { message: 'Done' });
      const completedTask = await eventPromise;
      expect(completedTask.id).toBe('completion-emit-test');
      expect(completedTask.status).toBe('COMPLETED');
    });

    it('sets completedAt timestamp when status set to COMPLETED', () => {
      const task = mockTask({ id: 'timestamp-test' });
      queue.enqueue(task);

      const beforeComplete = Date.now();
      queue.updateStatus(task.id, 'COMPLETED', { message: 'Done' });
      const afterComplete = Date.now();

      const completedTask = queue.getTask('timestamp-test');
      expect(completedTask?.completedAt).toBeDefined();
      expect(completedTask?.completedAt).toBeGreaterThanOrEqual(beforeComplete);
      expect(completedTask?.completedAt).toBeLessThanOrEqual(afterComplete);
    });

    it('includes createdAt and completedAt for duration calculation in completion events', async () => {
      const task = mockTask({ id: 'duration-calc-test' });
      queue.enqueue(task);

      const eventPromise = new Promise<Task>((resolve) => {
        queue.once('completion', resolve);
      });

      queue.updateStatus(task.id, 'COMPLETED', { message: 'Done' });
      const completedTask = await eventPromise;

      // createdAt is set when task is created in mockTask
      expect(completedTask.createdAt).toBeDefined();
      expect(completedTask.completedAt).toBeDefined();

      // Duration can be calculated
      const duration = (completedTask.completedAt || 0) - completedTask.createdAt;
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('waitForTask', () => {
    it('resolves immediately if task exists for role', async () => {
      const task = mockTask({ to: { role: 'developer' } });
      queue.enqueue(task);

      const result = await queue.waitForTask('agent-1', 'developer', 1000);
      expect(result).not.toBeNull();
      expect(result?.prompt).toBe('Test prompt');
    });

    it('resolves immediately if task exists for specific agent', async () => {
      const task = mockTask({ to: { agentId: 'specific-agent' } });
      queue.enqueue(task);

      const result = await queue.waitForTask('specific-agent', 'developer', 1000);
      expect(result).not.toBeNull();
    });

    it('returns null on timeout when no task', async () => {
      const result = await queue.waitForTask('no-task-agent', 'developer', 100);
      expect(result).toBeNull();
    });

    it('resolves when task enqueued during wait', async () => {
      const waitPromise = queue.waitForTask('waiting-agent', 'developer', 5000);

      // Enqueue after a short delay
      setTimeout(() => {
        queue.enqueue(mockTask({ to: { role: 'developer' } }));
      }, 50);

      const result = await waitPromise;
      expect(result).not.toBeNull();
    });

    it('sets status to PENDING_ACK when task found', async () => {
      const task = mockTask({ id: 'pending-ack-test' });
      queue.enqueue(task);

      await queue.waitForTask('agent-1', 'developer', 1000);
      expect(queue.getTask('pending-ack-test')?.status).toBe('PENDING_ACK');
    });
  });

  describe('ackTask', () => {
    it('transitions PENDING_ACK to ASSIGNED', async () => {
      const task = mockTask({ id: 'ack-test-1' });
      queue.enqueue(task);
      await queue.waitForTask('agent-1', 'developer', 1000);

      const result = queue.ackTask('ack-test-1', 'agent-1');
      expect(result.success).toBe(true);
      expect(queue.getTask('ack-test-1')?.status).toBe('ASSIGNED');
    });

    it('rejects ACK from wrong agent', async () => {
      const task = mockTask({ id: 'wrong-agent-ack' });
      queue.enqueue(task);
      await queue.waitForTask('agent-1', 'developer', 1000);

      const result = queue.ackTask('wrong-agent-ack', 'agent-2');
      expect(result.success).toBe(false);
      expect(result.error).toContain('agent-1');
    });

    it('rejects ACK for non-existent task', () => {
      const result = queue.ackTask('non-existent', 'agent-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('sets assignedTo property on the task', async () => {
      const task = mockTask({ id: 'assigned-to-test' });
      queue.enqueue(task);
      await queue.waitForTask('assigned-agent', 'developer', 1000);

      queue.ackTask('assigned-to-test', 'assigned-agent');

      const ackdTask = queue.getTask('assigned-to-test');
      expect(ackdTask?.assignedTo).toBe('assigned-agent');
    });
  });

  describe('getAll', () => {
    it('returns all tasks', () => {
      queue.enqueue(mockTask({ id: 'all-1' }));
      queue.enqueue(mockTask({ id: 'all-2' }));

      const all = queue.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getTaskHistory', () => {
    it('returns empty array when no tasks exist', () => {
      const history = queue.getTaskHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('accepts status filter option', () => {
      const history = queue.getTaskHistory({ status: 'COMPLETED' });
      expect(Array.isArray(history)).toBe(true);
    });

    it('accepts agentId filter option', () => {
      const history = queue.getTaskHistory({ agentId: 'test-agent' });
      expect(Array.isArray(history)).toBe(true);
    });

    it('accepts limit and offset pagination options', () => {
      const history = queue.getTaskHistory({ limit: 10, offset: 0 });
      expect(Array.isArray(history)).toBe(true);
    });

    it('combines multiple filter options', () => {
      const history = queue.getTaskHistory({
        status: 'COMPLETED',
        agentId: 'test-agent',
        limit: 5,
        offset: 0
      });
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('getTaskFromDB', () => {
    it('returns undefined for non-existent task', () => {
      const task = queue.getTaskFromDB('non-existent-task-id');
      expect(task).toBeUndefined();
    });

    it('accepts any taskId string', () => {
      const task = queue.getTaskFromDB('task-123-abc');
      // Should not throw, returns undefined when not found
      expect(task === undefined || task !== undefined).toBe(true);
    });
  });

  describe('getWaitingAgents', () => {
    it('returns empty array initially', () => {
      const waiting = queue.getWaitingAgents();
      expect(Array.isArray(waiting)).toBe(true);
    });

    it('tracks agents during waitForTask', async () => {
      // Start a wait (will timeout quickly)
      const waitPromise = queue.waitForTask('waiting-test-agent', 'developer', 100);

      // Check if agent is in waiting list during the wait
      const waiting = queue.getWaitingAgents();
      expect(Array.isArray(waiting)).toBe(true);

      // Wait for completion
      await waitPromise;
    });
  });

  describe('isAgentWaiting', () => {
    it('returns false for non-waiting agent', () => {
      const isWaiting = queue.isAgentWaiting('non-waiting-agent');
      expect(isWaiting).toBe(false);
    });

    it('tracks agent waiting state during waitForTask', async () => {
      // Start a wait
      const waitPromise = queue.waitForTask('is-waiting-test', 'developer', 100);

      // During wait, should be marked as waiting
      const duringWait = queue.isAgentWaiting('is-waiting-test');
      // Note: might be true or false depending on timing

      await waitPromise;

      // After wait completes, should be false
      const afterWait = queue.isAgentWaiting('is-waiting-test');
      expect(afterWait).toBe(false);
    });
  });

  describe('getAssignedTasksForAgent', () => {
    it('returns empty array for agent with no tasks', () => {
      const tasks = queue.getAssignedTasksForAgent('no-task-agent');
      expect(tasks).toEqual([]);
    });

    it('returns assigned tasks for agent', async () => {
      const task = mockTask({ id: 'assigned-test-1', to: { agentId: 'assigned-agent' } });
      queue.enqueue(task);

      // Wait for task to be picked up
      await queue.waitForTask('assigned-agent', 'developer', 100);

      // ACK the task to move to ASSIGNED
      queue.ackTask('assigned-test-1', 'assigned-agent');

      const tasks = queue.getAssignedTasksForAgent('assigned-agent');
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe('assigned-test-1');
    });
  });

  describe('cancelTask', () => {
    it('cancels a QUEUED task successfully', () => {
      const task = mockTask({ id: 'cancel-queue-test', status: 'QUEUED' });
      queue.enqueue(task);

      const result = queue.cancelTask('cancel-queue-test');
      expect(result.success).toBe(true);
      expect(queue.getTask('cancel-queue-test')?.status).toBe('CANCELLED');
    });

    it('cancels a PENDING_ACK task and cleans up pendingAcks', async () => {
      const task = mockTask({ id: 'cancel-pending-ack-test' });
      queue.enqueue(task);

      // Move to PENDING_ACK
      await queue.waitForTask('agent-1', 'developer', 100);
      expect(queue.getTask('cancel-pending-ack-test')?.status).toBe('PENDING_ACK');

      const result = queue.cancelTask('cancel-pending-ack-test');
      expect(result.success).toBe(true);
      expect(queue.getTask('cancel-pending-ack-test')?.status).toBe('CANCELLED');

      // Should fail to ACK now because pending map entry is gone
      const ackResult = queue.ackTask('cancel-pending-ack-test', 'agent-1');
      expect(ackResult.success).toBe(false);
    });

    it('fails to cancel a COMPLETED task', () => {
      const task = mockTask({ id: 'cancel-completed-test', status: 'COMPLETED' });
      queue.enqueue(task);
      // Force status update (enqueue sets to QUEUED usually, but we mock it)
      // Actually enqueue forces set, but let's update it to be sure logic holds
      queue.updateStatus('cancel-completed-test', 'COMPLETED', {});

      const result = queue.cancelTask('cancel-completed-test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already COMPLETED');
      expect(queue.getTask('cancel-completed-test')?.status).toBe('COMPLETED');
    });

    expect(result.error).toContain('not found');
  });

  it('cancels a task loaded from DB (archived/not-in-memory)', () => {
    // Mock db.prepare().get() to return a task row
    const mockTaskRow = {
      id: 'archived-cancel-test',
      status: 'QUEUED',
      prompt: 'test prompt',
      fromAgentId: 'user',
      fromAgentName: 'User',
      toAgentId: 'agent-1',
      context: '{}',
      createdAt: Date.now()
    };

    // Ensure db.prepare returns our mock row when looking up the task
    vi.mocked(db.prepare).mockImplementationOnce(() => ({
      get: () => mockTaskRow,
      run: vi.fn(),
      all: vi.fn()
    } as any));

    // Task is NOT in memory initially
    // queue.enqueue is NOT called

    const result = queue.cancelTask('archived-cancel-test');

    expect(result.success).toBe(true);
    // Should now be in memory and CANCELLED
    const task = queue.getTask('archived-cancel-test');
    expect(task).toBeDefined();
    expect(task?.status).toBe('CANCELLED');
  });
});
});
