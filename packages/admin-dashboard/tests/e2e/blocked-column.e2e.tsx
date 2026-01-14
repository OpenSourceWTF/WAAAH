/**
 * E2E Tests for BLOCKED Column in Kanban Board
 *
 * Tests that tasks with BLOCKED status are correctly displayed
 * in the dedicated BLOCKED column and not in other columns.
 *
 * Spec: 010-dashboard-ux-polish
 * Dependencies: T1 (BLOCKED column implementation)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, type RenderResult } from '@testing-library/react';
import React, { type ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { KanbanColumn } from '@/components/kanban/KanbanColumn';
import { COLUMNS } from '@/components/kanban/types';
import type { Task } from '@/components/kanban/types';

// Mock IntersectionObserver (not available in jsdom)
beforeAll(() => {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Wrapper to provide required contexts
function renderWithProviders(ui: ReactElement): RenderResult {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
}

// Factory function to create mock tasks
function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).substring(7)}`,
    prompt: 'Test task prompt',
    status: 'QUEUED',
    ...overrides,
  };
}

describe('BLOCKED Column E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. BLOCKED column configuration', () => {
    it('should have BLOCKED column defined in COLUMNS array', () => {
      const blockedColumn = COLUMNS.find(col => col.id === 'BLOCKED');
      expect(blockedColumn).toBeDefined();
      expect(blockedColumn?.label).toBe('BLOCKED');
      expect(blockedColumn?.statuses).toContain('BLOCKED');
    });

    it('should have BLOCKED column positioned between IN_PROGRESS and REVIEW', () => {
      const columnIds = COLUMNS.map(col => col.id);
      const inProgressIndex = columnIds.indexOf('IN_PROGRESS');
      const blockedIndex = columnIds.indexOf('BLOCKED');
      const reviewIndex = columnIds.indexOf('REVIEW');

      expect(blockedIndex).toBeGreaterThan(inProgressIndex);
      expect(blockedIndex).toBeLessThan(reviewIndex);
    });

    it('should NOT include BLOCKED status in REVIEW column', () => {
      const reviewColumn = COLUMNS.find(col => col.id === 'REVIEW');
      expect(reviewColumn?.statuses).not.toContain('BLOCKED');
    });
  });

  describe('2. BLOCKED column visibility', () => {
    it('should render BLOCKED column with correct label', () => {
      const blockedTasks: Task[] = [];

      renderWithProviders(
        <KanbanColumn
          id="BLOCKED"
          label="BLOCKED"
          tasks={blockedTasks}
          onCardClick={() => {}}
        />
      );

      expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    });

    it('should show task count badge in BLOCKED column', () => {
      const blockedTasks = [
        createMockTask({ id: 'blocked-1', status: 'BLOCKED' }),
        createMockTask({ id: 'blocked-2', status: 'BLOCKED' }),
      ];

      renderWithProviders(
        <KanbanColumn
          id="BLOCKED"
          label="BLOCKED"
          tasks={blockedTasks}
          onCardClick={() => {}}
        />
      );

      // Should show badge with count "2"
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should show "No tasks" when BLOCKED column is empty', () => {
      renderWithProviders(
        <KanbanColumn
          id="BLOCKED"
          label="BLOCKED"
          tasks={[]}
          onCardClick={() => {}}
        />
      );

      expect(screen.getByText('No tasks')).toBeInTheDocument();
    });
  });

  describe('3. BLOCKED tasks display in correct column', () => {
    it('should display blocked task in BLOCKED column', () => {
      const blockedTask = createMockTask({
        id: 'blocked-task-1',
        status: 'BLOCKED',
        prompt: 'This task is awaiting user input',
      });

      renderWithProviders(
        <KanbanColumn
          id="BLOCKED"
          label="BLOCKED"
          tasks={[blockedTask]}
          onCardClick={() => {}}
        />
      );

      // Task should be visible in the column
      expect(screen.getByText(/This task is awaiting user input/i)).toBeInTheDocument();
    });

    it('should display multiple blocked tasks', () => {
      const blockedTasks = [
        createMockTask({ id: 'blocked-1', status: 'BLOCKED', prompt: 'First blocked task' }),
        createMockTask({ id: 'blocked-2', status: 'BLOCKED', prompt: 'Second blocked task' }),
        createMockTask({ id: 'blocked-3', status: 'BLOCKED', prompt: 'Third blocked task' }),
      ];

      renderWithProviders(
        <KanbanColumn
          id="BLOCKED"
          label="BLOCKED"
          tasks={blockedTasks}
          onCardClick={() => {}}
        />
      );

      expect(screen.getByText(/First blocked task/i)).toBeInTheDocument();
      expect(screen.getByText(/Second blocked task/i)).toBeInTheDocument();
      expect(screen.getByText(/Third blocked task/i)).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument(); // Badge count
    });
  });

  describe('4. BLOCKED tasks NOT in IN_PROGRESS column', () => {
    it('should NOT show blocked task in IN_PROGRESS column when task is BLOCKED', () => {
      // Simulating filtering logic: IN_PROGRESS column should NOT contain BLOCKED tasks
      const inProgressStatuses = COLUMNS.find(col => col.id === 'IN_PROGRESS')?.statuses || [];

      expect(inProgressStatuses).not.toContain('BLOCKED');
    });

    it('should correctly filter BLOCKED tasks to BLOCKED column only', () => {
      const blockedTask = createMockTask({ id: 'blocked-1', status: 'BLOCKED' });
      const inProgressTask = createMockTask({ id: 'progress-1', status: 'IN_PROGRESS' });

      // Simulate column filtering logic
      const blockedColumnConfig = COLUMNS.find(col => col.id === 'BLOCKED');
      const inProgressColumnConfig = COLUMNS.find(col => col.id === 'IN_PROGRESS');

      // BLOCKED task should match BLOCKED column
      expect(blockedColumnConfig?.statuses.includes(blockedTask.status)).toBe(true);

      // BLOCKED task should NOT match IN_PROGRESS column
      expect(inProgressColumnConfig?.statuses.includes(blockedTask.status)).toBe(false);

      // IN_PROGRESS task should match IN_PROGRESS column
      expect(inProgressColumnConfig?.statuses.includes(inProgressTask.status)).toBe(true);

      // IN_PROGRESS task should NOT match BLOCKED column
      expect(blockedColumnConfig?.statuses.includes(inProgressTask.status)).toBe(false);
    });
  });

  describe('5. Column interaction', () => {
    it('should call onCardClick when blocked task is clicked', () => {
      const handleClick = vi.fn();
      const blockedTask = createMockTask({
        id: 'blocked-click-test',
        status: 'BLOCKED',
        prompt: 'Click test task',
      });

      renderWithProviders(
        <KanbanColumn
          id="BLOCKED"
          label="BLOCKED"
          tasks={[blockedTask]}
          onCardClick={handleClick}
        />
      );

      // Find and click the task card
      const taskElement = screen.getByText(/Click test task/i);
      taskElement.click();

      expect(handleClick).toHaveBeenCalledWith(blockedTask);
    });
  });
});
