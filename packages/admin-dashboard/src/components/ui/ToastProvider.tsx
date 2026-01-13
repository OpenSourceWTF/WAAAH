/**
 * Toast Notification System
 *
 * Provides toast notifications for task events via EventBus/Socket.io.
 * Subscribes to task:created and error events to show contextual toasts.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

// Toast types with corresponding colors
type ToastType = 'success' | 'warning' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  config: ToastConfig;
  setConfig: (config: Partial<ToastConfig>) => void;
  // Alias for compatibility
  showToast: (message: string, type?: ToastType) => void;
  // Notification history
  history: Toast[];
  unreadCount: number;
  clearHistory: () => void;
  markAllRead: () => void;
}

interface ToastConfig {
  /** Auto-dismiss delay in milliseconds (default: 3000) */
  dismissDelay: number;
  /** Event types to show toasts for */
  enabledEvents: {
    taskCreated: boolean;
    taskUpdated: boolean;
    noAgents: boolean;
    errors: boolean;
  };
}

const defaultConfig: ToastConfig = {
  dismissDelay: 3000,
  enabledEvents: {
    taskCreated: true,
    taskUpdated: false, // Too noisy by default
    noAgents: true,
    errors: true,
  },
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Hook to access toast functionality
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Get CSS classes for toast type
 */
function getToastStyles(type: ToastType): string {
  const base = 'px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 ease-out';

  switch (type) {
    case 'success':
      return `${base} bg-green-900/90 border-green-500/50 text-green-100`;
    case 'warning':
      return `${base} bg-amber-900/90 border-amber-500/50 text-amber-100`;
    case 'error':
      return `${base} bg-red-900/90 border-red-500/50 text-red-100`;
    case 'info':
    default:
      return `${base} bg-slate-800/90 border-slate-500/50 text-slate-100`;
  }
}

/**
 * Individual Toast component
 */
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div
      className={getToastStyles(toast.type)}
      onClick={onDismiss}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {toast.type === 'success' && <span>✓</span>}
        {toast.type === 'warning' && <span>⚠</span>}
        {toast.type === 'error' && <span>✕</span>}
        {toast.type === 'info' && <span>ℹ</span>}
        <span className="text-sm font-mono">{toast.message}</span>
      </div>
    </div>
  );
}

/**
 * Toast container - renders all active toasts
 */
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
}

/**
 * ToastProvider - Wraps app to provide toast notifications
 *
 * Automatically subscribes to Socket.io events and shows relevant toasts.
 */
const MAX_HISTORY = 20;

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [config, setConfigState] = useState<ToastConfig>(defaultConfig);
  const [history, setHistory] = useState<Toast[]>([]);
  const [lastReadTime, setLastReadTime] = useState<number>(Date.now());

  // Generate unique ID for each toast
  const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add a new toast
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = generateId();
    const toast: Toast = {
      id,
      message,
      type,
      createdAt: Date.now(),
    };
    setToasts((prev) => [...prev, toast]);
    // Also add to history (keep last MAX_HISTORY items, newest first)
    setHistory((prev) => [toast, ...prev].slice(0, MAX_HISTORY));
    return id;
  }, []);

  // Remove a toast by ID
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Update config
  const setConfig = useCallback((newConfig: Partial<ToastConfig>) => {
    setConfigState((prev) => ({
      ...prev,
      ...newConfig,
      enabledEvents: {
        ...prev.enabledEvents,
        ...(newConfig.enabledEvents || {}),
      },
    }));
  }, []);

  // Auto-dismiss toasts after configured delay
  useEffect(() => {
    if (toasts.length === 0) return;

    const timers = toasts.map((toast) => {
      const elapsed = Date.now() - toast.createdAt;
      const remaining = Math.max(0, config.dismissDelay - elapsed);
      return setTimeout(() => removeToast(toast.id), remaining);
    });

    return () => timers.forEach(clearTimeout);
  }, [toasts, config.dismissDelay, removeToast]);

  // Subscribe to SSE events
  useEffect(() => {
    const apiKey = import.meta.env.VITE_WAAAH_API_KEY || '';
    const eventSource = new EventSource(`/admin/events?apiKey=${apiKey}`);

    eventSource.onopen = () => {
      console.log('[ToastProvider] Connected to SSE stream');
    };

    // Handle task:created events
    eventSource.addEventListener('task:created', (event: any) => {
      if (!config.enabledEvents.taskCreated) return;
      try {
        const task = JSON.parse(event.data);
        addToast(`Task queued: ${task.id || task.taskId}`, 'success');
      } catch (e) {
        console.error('Failed to parse task:created', e);
      }
    });

    // Handle agent:list events (Initial sync)
    eventSource.addEventListener('agent:list', (event: any) => {
      if (!config.enabledEvents.noAgents) return;
      try {
        const agents = JSON.parse(event.data);
        if (Array.isArray(agents) && agents.length === 0) {
          addToast('Warning: No agents available to process tasks', 'warning');
        }
      } catch (e) {
        console.error('Failed to parse agent:list', e);
      }
    });

    // Handle connection errors
    eventSource.onerror = () => {
      // Don't toast on connection error to avoid spam, just logging
    };

    // Cleanup
    return () => {
      eventSource.close();
      console.log('[ToastProvider] Disconnected from SSE stream');
    };
  }, [config.enabledEvents, addToast]);

  // Clear all notification history
  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastReadTime(Date.now());
  }, []);

  // Mark all notifications as read
  const markAllRead = useCallback(() => {
    setLastReadTime(Date.now());
  }, []);

  // Count unread notifications (created after lastReadTime)
  const unreadCount = history.filter((t) => t.createdAt > lastReadTime).length;

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    config,
    setConfig,
    showToast: addToast, // Alias for compatibility
    history,
    unreadCount,
    clearHistory,
    markAllRead,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * NotificationCenter - Dropdown to show notification history
 */
export function NotificationCenter() {
  const { history, unreadCount, clearHistory, markAllRead } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  // Format relative time for notifications
  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Close dropdown when clicking outside
  const handleClickOutside = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      markAllRead();
    }
  }, [isOpen, markAllRead]);

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) markAllRead();
        }}
        className="relative w-10 h-10 flex items-center justify-center border border-primary/30 hover:bg-primary/20 transition-colors"
        title="Notifications"
      >
        <svg
          className="h-5 w-5 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={handleClickOutside} />

          {/* Dropdown panel */}
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-hidden bg-card border-2 border-primary z-50 shadow-lg animate-card-expand">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-primary/30 bg-primary/10">
              <span className="text-xs font-bold tracking-widest text-primary">NOTIFICATIONS</span>
              {history.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearHistory();
                  }}
                  className="text-[10px] font-bold text-primary/60 hover:text-primary uppercase"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Notification list */}
            <div className="overflow-y-auto max-h-80 scrollbar-none">
              {history.length === 0 ? (
                <div className="p-4 text-center text-primary/40 text-sm">
                  No notifications
                </div>
              ) : (
                history.slice(0, 10).map((notification) => (
                  <div
                    key={notification.id}
                    className="px-3 py-2 border-b border-primary/10 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      {/* Type icon */}
                      <span className={`flex-shrink-0 text-sm ${
                        notification.type === 'success' ? 'text-green-500' :
                        notification.type === 'warning' ? 'text-amber-500' :
                        notification.type === 'error' ? 'text-red-500' :
                        'text-slate-400'
                      }`}>
                        {notification.type === 'success' && '✓'}
                        {notification.type === 'warning' && '⚠'}
                        {notification.type === 'error' && '✕'}
                        {notification.type === 'info' && 'ℹ'}
                      </span>
                      {/* Message */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground font-mono truncate lowercase">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-primary/40 mt-0.5">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ToastProvider;
