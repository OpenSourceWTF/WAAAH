/**
 * Toast Notification System
 *
 * Provides toast notifications for task events via EventBus/Socket.io.
 * Subscribes to task:created and error events to show contextual toasts.
 */
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// import { getSocket, connectSocket } from '../../lib/socket'; // Switch to SSE

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
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md">
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
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [config, setConfigState] = useState<ToastConfig>(defaultConfig);

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
        addToast(`Task queued: ${task.id}`, 'success');
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
    eventSource.onerror = (err) => {
      // console.error('SSE Error:', err);
      // Don't toast on connection error to avoid spam, just logging
    };

    // Cleanup
    return () => {
      eventSource.close();
      console.log('[ToastProvider] Disconnected from SSE stream');
    };
  }, [config.enabledEvents, addToast]);

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    config,
    setConfig,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

export default ToastProvider;
