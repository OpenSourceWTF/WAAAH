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
  });

  describe('getAll', () => {
    it('returns all tasks', () => {
      queue.enqueue(mockTask({ id: 'all-1' }));
      queue.enqueue(mockTask({ id: 'all-2' }));

      const all = queue.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });
});
