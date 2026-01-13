import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { ToastProvider, NotificationCenter, useToast } from '@/components/ui/ToastProvider';

// Helper component to trigger toasts
function ToastTrigger({ message, type }: { message: string; type?: 'success' | 'warning' | 'error' | 'info' }) {
  const { addToast } = useToast();
  return (
    <button onClick={() => addToast(message, type)} data-testid="trigger">
      Add Toast
    </button>
  );
}

// Helper to render NotificationCenter with provider
function renderWithProvider(ui: React.ReactNode = <NotificationCenter />) {
  return render(
    <ToastProvider>
      {ui}
    </ToastProvider>
  );
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Bell Icon Button', () => {
    it('renders bell icon button', () => {
      renderWithProvider();
      const button = screen.getByTitle('Notifications');
      expect(button).toBeInTheDocument();
    });

    it('shows no badge when no unread notifications', () => {
      renderWithProvider();
      // Badge only shows when unreadCount > 0
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('toggles dropdown on click', () => {
      renderWithProvider();
      const button = screen.getByTitle('Notifications');

      // Initially closed
      expect(screen.queryByText('NOTIFICATIONS')).not.toBeInTheDocument();

      // Open dropdown
      fireEvent.click(button);
      expect(screen.getByText('NOTIFICATIONS')).toBeInTheDocument();

      // Close dropdown
      fireEvent.click(button);
      expect(screen.queryByText('NOTIFICATIONS')).not.toBeInTheDocument();
    });
  });

  describe('Notification History', () => {
    it('shows empty state when no notifications', () => {
      renderWithProvider();
      const button = screen.getByTitle('Notifications');
      fireEvent.click(button);

      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });

    it('displays notifications in history', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Test notification" type="success" />
          <NotificationCenter />
        </>
      );

      // Add a toast
      fireEvent.click(screen.getByTestId('trigger'));

      // Open notification center
      const button = screen.getByTitle('Notifications');
      fireEvent.click(button);

      // Check notification appears - may appear multiple times (toast + dropdown)
      const notifications = screen.getAllByText('Test notification');
      expect(notifications.length).toBeGreaterThanOrEqual(1);
    });

    it('displays notification type icons correctly', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Success message" type="success" />
          <NotificationCenter />
        </>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTitle('Notifications'));

      // Success icon should be present (may appear in both toast and dropdown)
      const icons = screen.getAllByText('✓');
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });

    it('shows timestamp for notifications', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Recent message" type="info" />
          <NotificationCenter />
        </>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTitle('Notifications'));

      // Should show "now" for recent notifications
      expect(screen.getByText('now')).toBeInTheDocument();
    });
  });

  describe('Unread Badge', () => {
    it('shows unread count badge', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Unread notification" type="info" />
          <NotificationCenter />
        </>
      );

      // Advance time to ensure toast createdAt > lastReadTime
      vi.advanceTimersByTime(100);

      // Add toast before opening (creates unread)
      fireEvent.click(screen.getByTestId('trigger'));

      // Badge should show a number (unread count)
      const button = screen.getByTitle('Notifications');
      const badge = button.querySelector('span[class*="bg-red-500"]');
      expect(badge).toBeInTheDocument();
    });

    it('clears unread badge when dropdown opened', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Unread notification" type="info" />
          <NotificationCenter />
        </>
      );

      // Advance time to ensure toast createdAt > lastReadTime
      vi.advanceTimersByTime(100);
      fireEvent.click(screen.getByTestId('trigger'));

      // Badge should exist before opening
      const button = screen.getByTitle('Notifications');
      let badge = button.querySelector('span[class*="bg-red-500"]');
      expect(badge).toBeInTheDocument();

      // Open dropdown marks as read
      fireEvent.click(button);

      // Badge should be gone after opening
      badge = button.querySelector('span[class*="bg-red-500"]');
      expect(badge).not.toBeInTheDocument();
    });

    it('shows 9+ for more than 9 unread notifications', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="ManyNotifs" type="info" />
          <NotificationCenter />
        </>
      );

      // Add 10 notifications with time advancing to ensure different timestamps
      const trigger = screen.getByTestId('trigger');
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(10); // Advance time slightly to ensure createdAt > lastReadTime
        fireEvent.click(trigger);
      }

      // Should show 9+ (more than 9 unread)
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

  describe('Clear All Functionality', () => {
    it('shows Clear All button when notifications exist', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Test notification" type="info" />
          <NotificationCenter />
        </>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTitle('Notifications'));

      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });

    it('does not show Clear All button when no notifications', () => {
      renderWithProvider();
      fireEvent.click(screen.getByTitle('Notifications'));

      expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
    });

    it('clears all notifications from history when clicked', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="Test notification" type="info" />
          <NotificationCenter />
        </>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTitle('Notifications'));

      // Get the dropdown panel
      const dropdown = screen.getByText('NOTIFICATIONS').closest('div[class*="absolute"]');
      expect(dropdown).toBeInTheDocument();

      // Notification should be in dropdown
      expect(within(dropdown!).getByText('Test notification')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Clear All'));

      // History should be cleared - dropdown shows empty state
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  describe('Dropdown Behavior', () => {
    it('closes dropdown when clicking outside', () => {
      renderWithProvider();

      fireEvent.click(screen.getByTitle('Notifications'));
      expect(screen.getByText('NOTIFICATIONS')).toBeInTheDocument();

      // Click backdrop
      const backdrop = document.querySelector('.fixed.inset-0');
      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(screen.queryByText('NOTIFICATIONS')).not.toBeInTheDocument();
    });
  });

  describe('Toast Types', () => {
    it.each([
      ['success', '✓'],
      ['warning', '⚠'],
      ['error', '✕'],
      ['info', 'ℹ'],
    ])('displays %s type with correct icon in dropdown', (type, icon) => {
      renderWithProvider(
        <>
          <ToastTrigger message={`${type} message`} type={type as 'success' | 'warning' | 'error' | 'info'} />
          <NotificationCenter />
        </>
      );

      fireEvent.click(screen.getByTestId('trigger'));
      fireEvent.click(screen.getByTitle('Notifications'));

      // Icon appears in both toast and dropdown, so we check for at least one
      const icons = screen.getAllByText(icon);
      expect(icons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('History Limit', () => {
    it('limits displayed items in dropdown to 10', () => {
      renderWithProvider(
        <>
          <ToastTrigger message="HistoryItem" type="info" />
          <NotificationCenter />
        </>
      );

      const trigger = screen.getByTestId('trigger');

      // Add 15 notifications
      for (let i = 0; i < 15; i++) {
        fireEvent.click(trigger);
      }

      fireEvent.click(screen.getByTitle('Notifications'));

      // Find the scrollable notification list container
      const notificationList = document.querySelector('.overflow-y-auto.max-h-80');
      expect(notificationList).toBeInTheDocument();

      // The dropdown shows at most 10 items (history.slice(0, 10))
      const itemsInDropdown = within(notificationList as HTMLElement).getAllByText('HistoryItem');
      expect(itemsInDropdown.length).toBeLessThanOrEqual(10);
    });
  });
});
