/**
 * Toast Notification System
 *
 * Provides toast notifications for task events via EventBus/Socket.io.
 * Subscribes to task:created and error events to show contextual toasts.
 */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';

// ============================================================================
// Types & Interfaces
// ============================================================================

type ToastType = 'success' | 'warning' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  createdAt: number;
}

interface ToastConfig {
  dismissDelay: number;
  enabledEvents: {
    taskCreated: boolean;
    taskUpdated: boolean;
    noAgents: boolean;
    errors: boolean;
  };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  config: ToastConfig;
  setConfig: (config: Partial<ToastConfig>) => void;
  showToast: (message: string, type?: ToastType) => void;
  history: Toast[];
  unreadCount: number;
  clearHistory: () => void;
  markAllRead: () => void;
}

interface SSETaskEvent {
  id?: string;
  taskId?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_HISTORY = 20;

const defaultConfig: ToastConfig = {
  dismissDelay: 3000,
  enabledEvents: {
    taskCreated: true,
    taskUpdated: false,
    noAgents: true,
    errors: true,
  },
};

const TOAST_STYLE_BASE = 'px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm transition-all duration-300 ease-out';

const TOAST_STYLES: Record<ToastType, string> = {
  success: `${TOAST_STYLE_BASE} bg-green-900/90 border-green-500/50 text-green-100`,
  warning: `${TOAST_STYLE_BASE} bg-amber-900/90 border-amber-500/50 text-amber-100`,
  error: `${TOAST_STYLE_BASE} bg-red-900/90 border-red-500/50 text-red-100`,
  info: `${TOAST_STYLE_BASE} bg-slate-800/90 border-slate-500/50 text-slate-100`,
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  warning: '⚠',
  error: '✕',
  info: 'ℹ',
};

// ============================================================================
// Utility Functions
// ============================================================================

const generateToastId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// ============================================================================
// Custom Hooks
// ============================================================================

function useToastAutoDismiss(
  toasts: Toast[],
  dismissDelay: number,
  removeToast: (id: string) => void
) {
  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), Math.max(0, dismissDelay - (Date.now() - toast.createdAt)))
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissDelay, removeToast]);
}

function useSSEToastEvents(
  enabledEvents: ToastConfig['enabledEvents'],
  addToast: (message: string, type?: ToastType) => void
) {
  useEffect(() => {
    const apiKey = import.meta.env.VITE_WAAAH_API_KEY ?? '';
    const eventSource = new EventSource(`/admin/events?apiKey=${apiKey}`);

    const handleTaskCreated = (event: MessageEvent) => {
      if (!enabledEvents.taskCreated) return;
      try {
        const task = JSON.parse(event.data) as SSETaskEvent;
        addToast(`Task queued: ${task.id ?? task.taskId}`, 'success');
      } catch { /* parse error */ }
    };

    const handleAgentList = (event: MessageEvent) => {
      if (!enabledEvents.noAgents) return;
      try {
        const agents = JSON.parse(event.data) as unknown[];
        if (agents.length === 0) addToast('Warning: No agents available to process tasks', 'warning');
      } catch { /* parse error */ }
    };

    eventSource.addEventListener('task:created', handleTaskCreated);
    eventSource.addEventListener('agent:list', handleAgentList);

    return () => eventSource.close();
  }, [enabledEvents.taskCreated, enabledEvents.noAgents, addToast]);
}

function useNotificationHistory() {
  const [history, setHistory] = useState<Toast[]>([]);
  const [lastReadTime, setLastReadTime] = useState<number>(Date.now());

  const addToHistory = useCallback((toast: Toast) => {
    setHistory((prev) => [toast, ...prev].slice(0, MAX_HISTORY));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setLastReadTime(Date.now());
  }, []);

  const markAllRead = useCallback(() => setLastReadTime(Date.now()), []);

  const unreadCount = history.filter((t) => t.createdAt > lastReadTime).length;

  return { history, addToHistory, clearHistory, markAllRead, unreadCount };
}

// ============================================================================
// Components
// ============================================================================

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div className={TOAST_STYLES[toast.type]} onClick={onDismiss} role="alert" aria-live="polite">
      <div className="flex items-center gap-2">
        <span>{TOAST_ICONS[toast.type]}</span>
        <span className="text-sm font-mono">{toast.message}</span>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-md">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

interface ToastProviderProps {
  children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [config, setConfigState] = useState<ToastConfig>(defaultConfig);
  const { history, addToHistory, clearHistory, markAllRead, unreadCount } = useNotificationHistory();

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const toast: Toast = { id: generateToastId(), message, type, createdAt: Date.now() };
    setToasts((prev) => [...prev, toast]);
    addToHistory(toast);
    return toast.id;
  }, [addToHistory]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setConfig = useCallback((newConfig: Partial<ToastConfig>) => {
    setConfigState((prev) => ({
      ...prev,
      ...newConfig,
      enabledEvents: { ...prev.enabledEvents, ...(newConfig.enabledEvents ?? {}) },
    }));
  }, []);

  useToastAutoDismiss(toasts, config.dismissDelay, removeToast);
  useSSEToastEvents(config.enabledEvents, addToast);

  const value: ToastContextValue = {
    toasts, addToast, removeToast, config, setConfig, showToast: addToast,
    history, unreadCount, clearHistory, markAllRead,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export { NotificationCenter } from './NotificationCenter';
export default ToastProvider;
