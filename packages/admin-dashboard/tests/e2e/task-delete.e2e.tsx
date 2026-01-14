/**
 * E2E Tests for Task Deletion with Confirmation Dialog
 *
 * Tests the delete functionality including confirmation modal,
 * cancel behavior, and processing task warnings.
 *
 * Spec: 010-dashboard-ux-polish V2
 * Dependencies: T2 (Delete with confirm)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, type RenderResult } from '@testing-library/react';
import React, { type ReactElement } from 'react';
import { ExpandedCardView } from '@/components/kanban/ExpandedCardView';
import type { Task } from '@/components/kanban/types';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Mock scrollIntoView which is not available in JSDOM
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock DiffViewer since it makes API calls
vi.mock('@/components/DiffViewer', () => ({
  DiffViewer: () => <div data-testid="diff-viewer">Mock Diff Viewer</div>
}));

// Mock the utils that may have side effects
vi.mock('@/components/kanban/utils', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getProgressUpdates: () => [],
  };
});

// Wrapper to provide required contexts
function renderWithProviders(ui: ReactElement): RenderResult {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
}

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-delete-test-123',
  prompt: '# Test Task\n\nThis task will be deleted.',
  status: 'QUEUED',
  createdAt: Date.now(),
  messages: [],
  ...overrides,
});

const createDefaultProps = (overrides: Record<string, unknown> = {}) => ({
  onClose: vi.fn(),
  onSendComment: vi.fn(),
  onApproveTask: vi.fn(),
  onRejectTask: vi.fn(),
  onUnblockTask: vi.fn(),
  onRetryTask: vi.fn(),
  onCancelTask: vi.fn(),
  onAddReviewComment: vi.fn(),
  onUpdateTask: vi.fn(),
  onDeleteTask: vi.fn(),
  ...overrides,
});

describe('Task Deletion with Confirmation - E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Delete button visibility', () => {
    it('should display Delete button for QUEUED tasks', () => {
      const task = createMockTask({ status: 'QUEUED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeInTheDocument();
    });

    it('should display Delete button for ASSIGNED tasks', () => {
      const task = createMockTask({ status: 'ASSIGNED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeInTheDocument();
    });

    it('should display Delete button for IN_PROGRESS tasks', () => {
      const task = createMockTask({ status: 'IN_PROGRESS' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeInTheDocument();
    });

    it('should NOT display Delete button for COMPLETED tasks', () => {
      const task = createMockTask({ status: 'COMPLETED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.queryByRole('button', { name: /delete/i });
      expect(deleteButton).not.toBeInTheDocument();
    });

    it('should NOT display Delete button for FAILED tasks', () => {
      const task = createMockTask({ status: 'FAILED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.queryByRole('button', { name: /delete/i });
      expect(deleteButton).not.toBeInTheDocument();
    });
  });

  describe('2. Confirmation dialog behavior', () => {
    it('should show confirmation dialog when Delete button clicked', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Verify confirm dialog appears
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });
    });

    it('should show DELETE TASK heading in confirmation dialog', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByText(/delete task/i)).toBeInTheDocument();
      });
    });

    it('should have Cancel and Delete Permanently buttons in dialog', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /delete permanently/i })).toBeInTheDocument();
      });
    });
  });

  describe('3. Cancel behavior', () => {
    it('should NOT delete task when Cancel clicked in dialog', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const onDeleteTask = vi.fn();
      const props = createDefaultProps({ onDeleteTask });

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Verify onDeleteTask was NOT called
      expect(onDeleteTask).not.toHaveBeenCalled();
    });

    it('should close dialog when Cancel clicked', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });

      // Click Cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      // Verify dialog is closed
      await waitFor(() => {
        expect(screen.queryByText(/delete permanently\? this cannot be undone\./i)).not.toBeInTheDocument();
      });
    });
  });

  describe('4. Confirm delete behavior', () => {
    it('should call onDeleteTask when Confirm clicked', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const onDeleteTask = vi.fn();
      const props = createDefaultProps({ onDeleteTask });

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });

      // Click Delete Permanently
      const confirmButton = screen.getByRole('button', { name: /delete permanently/i });
      fireEvent.click(confirmButton);

      // Verify onDeleteTask was called with task id
      expect(onDeleteTask).toHaveBeenCalledWith('task-delete-test-123');
    });

    it('should close expanded view after confirming delete', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const onClose = vi.fn();
      const props = createDefaultProps({ onClose });

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });

      // Click Delete Permanently
      const confirmButton = screen.getByRole('button', { name: /delete permanently/i });
      fireEvent.click(confirmButton);

      // Verify onClose was called to close expanded view
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('5. Processing task warning', () => {
    it('should show warning message for IN_PROGRESS task', async () => {
      const task = createMockTask({ status: 'IN_PROGRESS' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Verify warning message appears for processing task
      await waitFor(() => {
        expect(screen.getByText(/task is currently processing/i)).toBeInTheDocument();
      });
    });

    it('should show warning message for PROCESSING task', async () => {
      const task = createMockTask({ status: 'PROCESSING' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Verify warning message appears for processing task
      await waitFor(() => {
        expect(screen.getByText(/task is currently processing/i)).toBeInTheDocument();
      });
    });

    it('should NOT show warning for QUEUED task', async () => {
      const task = createMockTask({ status: 'QUEUED' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Verify dialog appears but no warning
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/task is currently processing/i)).not.toBeInTheDocument();
    });

    it('should NOT show warning for PENDING_ACK task', async () => {
      const task = createMockTask({ status: 'PENDING_ACK' });
      const props = createDefaultProps();

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button to open dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Verify dialog appears but no warning
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });
      expect(screen.queryByText(/task is currently processing/i)).not.toBeInTheDocument();
    });
  });

  describe('6. Integration with ExpandedCardView', () => {
    it('should pass correct task id to onDeleteTask', async () => {
      const taskId = 'task-unique-id-456';
      const task = createMockTask({ id: taskId, status: 'QUEUED' });
      const onDeleteTask = vi.fn();
      const props = createDefaultProps({ onDeleteTask });

      renderWithProviders(<ExpandedCardView task={task} {...props} />);

      // Click Delete button
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirm delete
      await waitFor(() => {
        expect(screen.getByText(/delete permanently\? this cannot be undone\./i)).toBeInTheDocument();
      });

      const confirmButton = screen.getByRole('button', { name: /delete permanently/i });
      fireEvent.click(confirmButton);

      expect(onDeleteTask).toHaveBeenCalledWith(taskId);
    });
  });
});
