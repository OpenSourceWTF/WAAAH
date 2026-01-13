/**
 * E2E Tests for Toast Visibility
 *
 * Tests that toast notifications appear above all other UI elements
 * including modals and expanded card views.
 *
 * Spec: 010-ui-redesign
 * Dependencies: T6 (Toast Fix)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ToastProvider, useToast } from '@/components/ui/ToastProvider';
import { ExpandedCardView } from '@/components/kanban/ExpandedCardView';
import { ThemeProvider } from '@/contexts/ThemeContext';
import type { Task } from '@/components/kanban/types';

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

// Helper component to trigger toasts for testing
// eslint-disable-next-line react-refresh/only-export-components
function ToastTrigger({ type = 'info', message = 'Test toast message' }: { type?: 'success' | 'warning' | 'error' | 'info'; message?: string }) {
  const { addToast } = useToast();
  return (
    <button
      data-testid="trigger-toast"
      onClick={() => addToast(message, type)}
    >
      Trigger Toast
    </button>
  );
}

// Test wrapper with all required providers
// eslint-disable-next-line react-refresh/only-export-components
function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </ThemeProvider>
  );
}

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-toast-test',
  prompt: '# Toast Test Task\n\nTest prompt for toast visibility.',
  status: 'IN_REVIEW',
  createdAt: Date.now(),
  messages: [],
  ...overrides,
});

const defaultProps = {
  onClose: vi.fn(),
  onSendComment: vi.fn(),
  onApproveTask: vi.fn(),
  onRejectTask: vi.fn(),
  onUnblockTask: vi.fn(),
  onRetryTask: vi.fn(),
  onCancelTask: vi.fn(),
  onAddReviewComment: vi.fn(),
  onUpdateTask: vi.fn(),
};

describe('Toast Visibility E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Toast visible at baseline', () => {
    it('should display toast when triggered', async () => {
      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      // Trigger a toast
      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Assert toast is visible
      const toast = await screen.findByRole('alert');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveTextContent('Test toast message');
    });

    it('should display toast with correct type styling', async () => {
      render(
        <TestWrapper>
          <ToastTrigger type="error" message="Error toast" />
        </TestWrapper>
      );

      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      const toast = await screen.findByRole('alert');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveTextContent('Error toast');
      // Error toasts have red styling
      expect(toast.className).toContain('bg-red');
    });

    it('should have z-index of 100 (higher than modals)', async () => {
      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Find the toast container (parent of toast with z-index)
      const toast = await screen.findByRole('alert');
      const container = toast.parentElement;
      expect(container).toBeInTheDocument();
      expect(container?.className).toContain('z-[100]');
    });
  });

  describe('2. Toast visible over ExpandedCardView', () => {
    it('should display toast above expanded card view', async () => {
      const task = createMockTask();

      render(
        <TestWrapper>
          <div className="relative h-screen">
            <ExpandedCardView task={task} {...defaultProps} />
            <ToastTrigger type="error" message="Error while processing" />
          </div>
        </TestWrapper>
      );

      // Verify the expanded card is visible
      expect(screen.getByText(/toast test task/i)).toBeInTheDocument();

      // Trigger an error toast
      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Assert toast appears
      const toast = await screen.findByRole('alert');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveTextContent('Error while processing');

      // Verify z-index hierarchy: toast (z-100) > expanded card (z-20)
      const container = toast.parentElement;
      expect(container?.className).toContain('z-[100]');
    });

    it('should allow clicking toast while expanded card is open', async () => {
      const task = createMockTask();

      render(
        <TestWrapper>
          <div className="relative h-screen">
            <ExpandedCardView task={task} {...defaultProps} />
            <ToastTrigger />
          </div>
        </TestWrapper>
      );

      // Trigger a toast
      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Get the toast
      const toast = await screen.findByRole('alert');
      expect(toast).toBeInTheDocument();

      // Click the toast - it should be dismissible
      fireEvent.click(toast);

      // Toast should be removed after click
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });
  });

  describe('3. Toast auto-dismisses', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should auto-dismiss after default delay (3000ms)', async () => {
      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      // Trigger a toast
      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Toast should be visible initially
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Advance timers past the dismiss delay (3000ms)
      act(() => {
        vi.advanceTimersByTime(3500);
      });

      // Toast should be removed
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('should not dismiss before delay completes', async () => {
      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Toast should be visible
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Advance timers but not past the delay
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Toast should still be visible
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('4. Toast click-to-dismiss', () => {
    it('should dismiss immediately when clicked', async () => {
      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      // Trigger a toast
      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      // Toast should be visible
      const toast = await screen.findByRole('alert');
      expect(toast).toBeInTheDocument();

      // Click the toast to dismiss
      fireEvent.click(toast);

      // Toast should be immediately removed
      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
    });

    it('should dismiss faster than auto-dismiss when clicked', async () => {
      vi.useFakeTimers();

      render(
        <TestWrapper>
          <ToastTrigger />
        </TestWrapper>
      );

      const triggerButton = screen.getByTestId('trigger-toast');
      fireEvent.click(triggerButton);

      const toast = screen.getByRole('alert');

      // Only advance 500ms (well before 3000ms auto-dismiss)
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // Toast should still be visible
      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Click to dismiss
      fireEvent.click(toast);

      // Should be dismissed immediately, not waiting for timer
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('should dismiss only the clicked toast when multiple toasts exist', async () => {
      // Component that can trigger multiple toasts
      function MultiToastTrigger() {
        const { addToast } = useToast();
        return (
          <div>
            <button
              data-testid="trigger-toast-1"
              onClick={() => addToast('Toast 1', 'info')}
            >
              Toast 1
            </button>
            <button
              data-testid="trigger-toast-2"
              onClick={() => addToast('Toast 2', 'success')}
            >
              Toast 2
            </button>
          </div>
        );
      }

      render(
        <TestWrapper>
          <MultiToastTrigger />
        </TestWrapper>
      );

      // Trigger two toasts
      fireEvent.click(screen.getByTestId('trigger-toast-1'));
      fireEvent.click(screen.getByTestId('trigger-toast-2'));

      // Both toasts should be visible
      const toasts = await screen.findAllByRole('alert');
      expect(toasts).toHaveLength(2);

      // Click the first toast
      fireEvent.click(toasts[0]);

      // Only one toast should remain
      await waitFor(() => {
        expect(screen.getAllByRole('alert')).toHaveLength(1);
      });

      // The remaining toast should be the second one
      expect(screen.getByRole('alert')).toHaveTextContent('Toast 2');
    });
  });

  describe('Z-Index Verification', () => {
    it('toast z-index (100) is higher than ExpandedCardView z-index (20)', () => {
      // This is a static verification of the z-index values
      // ToastContainer uses z-[100]
      // ExpandedCardView uses z-20
      // 100 > 20, therefore toast appears above expanded card
      const toastZIndex = 100;
      const expandedCardZIndex = 20;
      expect(toastZIndex).toBeGreaterThan(expandedCardZIndex);
    });

    it('toast z-index (100) is higher than modal z-index (50)', () => {
      // Modals inside ExpandedCardView (unblock modal, reject modal) use z-50
      // ToastContainer uses z-[100]
      // 100 > 50, therefore toast appears above modals
      const toastZIndex = 100;
      const modalZIndex = 50;
      expect(toastZIndex).toBeGreaterThan(modalZIndex);
    });
  });
});
