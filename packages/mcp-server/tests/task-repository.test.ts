/**
 * Task Repository Tests
 * 
 * Integration tests for task CRUD operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { TaskRepository } from '../src/state/persistence/task-repository.js';
import { initializeSchema } from '../src/state/persistence/database-factory.js';
import type { Task, TaskStatus } from '@opensourcewtf/waaah-types';

// Mock eventbus
vi.mock('../src/state/eventbus.js', () => ({
  emitTaskCreated: vi.fn(),
  emitTaskUpdated: vi.fn(),
  emitAgentStatus: vi.fn()
}));

function createTask(id: string, status: TaskStatus = 'QUEUED', overrides: Partial<Task> = {}): Task {
  return {
    id,
    command: 'execute_prompt',
    prompt: 'Test prompt',
    from: { type: 'user', id: 'u1', name: 'User' },
    to: {},
    priority: 'normal',
    status,
    createdAt: Date.now(),
    ...overrides
  } as Task;
}

describe('TaskRepository', () => {
  let db: Database.Database;
  let repo: TaskRepository;

  beforeEach(() => {
    db = new Database(':memory:');

    // Use actual schema from database-factory
    initializeSchema(db);

    repo = new TaskRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('insert', () => {
    it('inserts a new task', () => {
      const task = createTask('task-1');

      repo.insert(task);

      const retrieved = repo.getById('task-1');
      expect(retrieved?.id).toBe('task-1');
      expect(retrieved?.prompt).toBe('Test prompt');
    });

    it('handles task with dependencies', () => {
      const task = createTask('task-2', 'QUEUED', { dependencies: ['dep-1', 'dep-2'] });

      repo.insert(task);

      const retrieved = repo.getById('task-2');
      expect(retrieved?.dependencies).toEqual(['dep-1', 'dep-2']);
    });
  });

  describe('update', () => {
    it('updates task status and response', () => {
      const task = createTask('task-3');
      repo.insert(task);

      task.status = 'COMPLETED';
      task.response = 'Done!';
      repo.update(task);

      const retrieved = repo.getById('task-3');
      expect(retrieved?.status).toBe('COMPLETED');
      expect(retrieved?.response).toBe('Done!');
    });

    it('updates task assignment', () => {
      const task = createTask('task-4');
      repo.insert(task);

      task.assignedTo = 'agent-1';
      repo.update(task);

      const retrieved = repo.getById('task-4');
      expect(retrieved?.assignedTo).toBe('agent-1');
    });
  });

  describe('updateStatus', () => {
    it('updates only the status field', () => {
      const task = createTask('task-5');
      repo.insert(task);

      repo.updateStatus('task-5', 'IN_PROGRESS');

      const retrieved = repo.getById('task-5');
      expect(retrieved?.status).toBe('IN_PROGRESS');
    });
  });

  describe('getById', () => {
    it('returns task by ID', () => {
      repo.insert(createTask('task-6'));

      const task = repo.getById('task-6');

      expect(task?.id).toBe('task-6');
    });

    it('returns null for non-existent task', () => {
      expect(repo.getById('nonexistent')).toBeNull();
    });
  });

  describe('getActive', () => {
    it('returns only non-terminal tasks', () => {
      repo.insert(createTask('t1', 'QUEUED'));
      repo.insert(createTask('t2', 'IN_PROGRESS'));
      repo.insert(createTask('t3', 'COMPLETED'));
      repo.insert(createTask('t4', 'FAILED'));

      const active = repo.getActive();

      expect(active).toHaveLength(2);
      expect(active.map(t => t.id).sort()).toEqual(['t1', 't2']);
    });
  });

  describe('getByStatus', () => {
    it('returns tasks with specific status', () => {
      repo.insert(createTask('s1', 'QUEUED'));
      repo.insert(createTask('s2', 'QUEUED'));
      repo.insert(createTask('s3', 'IN_PROGRESS'));

      const queued = repo.getByStatus('QUEUED');

      expect(queued).toHaveLength(2);
    });
  });

  describe('getByStatuses', () => {
    it('returns tasks with any of specified statuses', () => {
      repo.insert(createTask('m1', 'QUEUED'));
      repo.insert(createTask('m2', 'IN_PROGRESS'));
      repo.insert(createTask('m3', 'COMPLETED'));

      const tasks = repo.getByStatuses(['QUEUED', 'IN_PROGRESS']);

      expect(tasks).toHaveLength(2);
    });
  });

  describe('getByAssignedTo', () => {
    it('returns tasks assigned to specific agent', () => {
      repo.insert(createTask('a1', 'IN_PROGRESS', { assignedTo: 'agent-1' }));
      repo.insert(createTask('a2', 'IN_PROGRESS', { assignedTo: 'agent-2' }));

      const assigned = repo.getByAssignedTo('agent-1');

      expect(assigned).toHaveLength(1);
      expect(assigned[0].id).toBe('a1');
    });
  });

  describe('getHistory', () => {
    it('returns paginated task history', () => {
      for (let i = 0; i < 15; i++) {
        repo.insert(createTask(`h${i}`, 'COMPLETED'));
      }

      const page1 = repo.getHistory({ limit: 10, offset: 0 });
      const page2 = repo.getHistory({ limit: 10, offset: 10 });

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(5);
    });

    it('filters by status', () => {
      repo.insert(createTask('f1', 'COMPLETED'));
      repo.insert(createTask('f2', 'FAILED'));

      const completed = repo.getHistory({ status: 'COMPLETED' });

      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('f1');
    });
  });

  describe('getStats', () => {
    it('returns queue statistics', () => {
      repo.insert(createTask('st1', 'QUEUED'));
      repo.insert(createTask('st2', 'QUEUED'));
      repo.insert(createTask('st3', 'IN_PROGRESS'));
      repo.insert(createTask('st4', 'COMPLETED'));

      const stats = repo.getStats();

      expect(stats.total).toBe(4);
      expect(stats.byStatus.QUEUED).toBe(2);
      expect(stats.byStatus.IN_PROGRESS).toBe(1);
      expect(stats.byStatus.COMPLETED).toBe(1);
    });
  });

  describe('messages', () => {
    it('adds and retrieves messages', () => {
      repo.insert(createTask('msg1'));

      repo.addMessage('msg1', 'user', 'Hello');
      repo.addMessage('msg1', 'agent', 'Hi there');

      const messages = repo.getMessages('msg1');

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');
      expect(messages[1].content).toBe('Hi there');
    });

    // Note: unread comments tests removed as task_messages schema
    // doesn't have isRead column in current database-factory
  });

  describe('clearAll', () => {
    it('clears all tasks', () => {
      repo.insert(createTask('c1'));
      repo.insert(createTask('c2'));

      repo.clearAll();

      expect(repo.getById('c1')).toBeNull();
      expect(repo.getById('c2')).toBeNull();
    });
  });
});
