/**
 * NotificationCenter - Dropdown component for notification history
 */
import { useState, useCallback } from 'react';
import { useToast } from './ToastProvider';

// ============================================================================
// Types
// ============================================================================

type ToastType = 'success' | 'warning' | 'error' | 'info';

interface Notification {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  warning: '⚠',
  error: '✕',
  info: 'ℹ',
};

const NOTIFICATION_TYPE_COLORS: Record<ToastType, string> = {
  success: 'text-green-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  info: 'text-slate-400',
};

// ============================================================================
// Utility Functions
// ============================================================================

const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// ============================================================================
// Sub-Components
// ============================================================================

function NotificationItem({ notification }: { notification: Notification }) {
  return (
    <div className="px-3 py-2 border-b border-primary/10 hover:bg-primary/5 transition-colors">
      <div className="flex items-start gap-2">
        <span className={`flex-shrink-0 text-sm ${NOTIFICATION_TYPE_COLORS[notification.type]}`}>
          {TOAST_ICONS[notification.type]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground font-mono truncate lowercase">
            {notification.message}
          </p>
          <p className="text-[10px] text-primary/40 mt-0.5">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}

function NotificationHeader({ onClear, hasItems }: { onClear: () => void; hasItems: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-primary/30 bg-primary/10">
      <span className="text-xs font-bold tracking-widest text-primary">NOTIFICATIONS</span>
      {hasItems && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="text-[10px] font-bold text-primary/60 hover:text-primary uppercase"
        >
          Clear All
        </button>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      className="h-5 w-5 text-primary"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function NotificationList({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) {
    return <div className="p-4 text-center text-primary/40 text-sm">No notifications</div>;
  }
  return (
    <>
      {notifications.slice(0, 10).map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function NotificationCenter() {
  const { history, unreadCount, clearHistory, markAllRead } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (newState) markAllRead();
  };

  const handleClose = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      markAllRead();
    }
  }, [isOpen, markAllRead]);

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="relative w-10 h-10 flex items-center justify-center border border-primary/30 hover:bg-primary/20 transition-colors"
        title="Notifications"
      >
        <BellIcon />
        <UnreadBadge count={unreadCount} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={handleClose} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden bg-card border-2 border-primary z-50 shadow-lg animate-card-expand">
            <NotificationHeader onClear={clearHistory} hasItems={history.length > 0} />
            <div className="overflow-y-auto max-h-80 scrollbar-none">
              <NotificationList notifications={history} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationCenter;
