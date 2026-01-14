import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredTasks } from '../../src/hooks/useFilteredTasks';
import type { Task } from '../../src/components/kanban/types';

describe('useFilteredTasks', () => {
  const createTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'test-task',
    prompt: 'Test prompt',
    status: 'QUEUED',
    ...overrides,
  });

  describe('BLOCKED column filtering', () => {
    it('filters BLOCKED tasks into BLOCKED column', () => {
      const blockedTask = createTask({ id: 'blocked-1', status: 'BLOCKED' });

      const { result } = renderHook(() =>
        useFilteredTasks({
          tasks: [blockedTask],
          completedTasks: [],
          cancelledTasks: [],
          searchQuery: '',
        })
      );

      expect(result.current.BLOCKED).toHaveLength(1);
      expect(result.current.BLOCKED[0].id).toBe('blocked-1');
    });

    it('does not include BLOCKED tasks in REVIEW column', () => {
      const blockedTask = createTask({ id: 'blocked-1', status: 'BLOCKED' });
      const reviewTask = createTask({ id: 'review-1', status: 'IN_REVIEW' });

      const { result } = renderHook(() =>
        useFilteredTasks({
          tasks: [blockedTask, reviewTask],
          completedTasks: [],
          cancelledTasks: [],
          searchQuery: '',
        })
      );

      expect(result.current.BLOCKED).toHaveLength(1);
      expect(result.current.BLOCKED[0].id).toBe('blocked-1');
      expect(result.current.REVIEW).toHaveLength(1);
      expect(result.current.REVIEW[0].id).toBe('review-1');
    });

    it('filters multiple BLOCKED tasks correctly', () => {
      const blocked1 = createTask({ id: 'blocked-1', status: 'BLOCKED' });
      const blocked2 = createTask({ id: 'blocked-2', status: 'BLOCKED' });

      const { result } = renderHook(() =>
        useFilteredTasks({
          tasks: [blocked1, blocked2],
          completedTasks: [],
          cancelledTasks: [],
          searchQuery: '',
        })
      );

      expect(result.current.BLOCKED).toHaveLength(2);
    });

    it('BLOCKED column respects search query', () => {
      const blocked1 = createTask({ id: 'blocked-1', status: 'BLOCKED', prompt: 'fix auth bug' });
      const blocked2 = createTask({ id: 'blocked-2', status: 'BLOCKED', prompt: 'update readme' });

      const { result } = renderHook(() =>
        useFilteredTasks({
          tasks: [blocked1, blocked2],
          completedTasks: [],
          cancelledTasks: [],
          searchQuery: 'auth',
        })
      );

      expect(result.current.BLOCKED).toHaveLength(1);
      expect(result.current.BLOCKED[0].id).toBe('blocked-1');
    });
  });

  describe('column separation', () => {
    it('correctly distributes tasks across all columns', () => {
      const tasks = [
        createTask({ id: 'todo-1', status: 'QUEUED' }),
        createTask({ id: 'progress-1', status: 'IN_PROGRESS' }),
        createTask({ id: 'blocked-1', status: 'BLOCKED' }),
        createTask({ id: 'review-1', status: 'IN_REVIEW' }),
      ];
      const completedTasks = [createTask({ id: 'done-1', status: 'COMPLETED' })];
      const cancelledTasks = [createTask({ id: 'cancelled-1', status: 'CANCELLED' })];

      const { result } = renderHook(() =>
        useFilteredTasks({
          tasks,
          completedTasks,
          cancelledTasks,
          searchQuery: '',
        })
      );

      expect(result.current.TODO).toHaveLength(1);
      expect(result.current.IN_PROGRESS).toHaveLength(1);
      expect(result.current.BLOCKED).toHaveLength(1);
      expect(result.current.REVIEW).toHaveLength(1);
      expect(result.current.DONE).toHaveLength(1);
      expect(result.current.CANCELLED).toHaveLength(1);
    });
  });
});
