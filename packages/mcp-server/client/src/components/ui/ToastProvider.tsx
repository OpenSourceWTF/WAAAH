import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// --- Types ---

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: Toast['type'], duration?: number) => void;
}

// --- Context ---

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

// --- Component ---

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Function to add a toast manually
  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration = 3000) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  // Remove toast helper
  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // --- SSE Integration ---
  useEffect(() => {
    const eventSource = new EventSource('/admin/events');

    eventSource.onopen = () => {
      console.log('[ToastProvider] Connected to SSE stream');
    };

    eventSource.addEventListener('task:created', (event: any) => {
      try {
        const data = JSON.parse(event.data);
        showToast(`Task queued: ${data.taskId}`, 'success');
      } catch (e) {
        console.error('Failed to parse task:created event', e);
      }
    });

    eventSource.addEventListener('error', (err) => {
      // Only log error, don't show toast for connection jitters to avoid spam
      console.error('SSE Error:', err);
    });

    return () => {
      eventSource.close();
    };
  }, [showToast]);


  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`
              min-w-[300px] p-4 rounded-md shadow-lg text-white transform transition-all duration-300 ease-in-out
              ${toast.type === 'success' ? 'bg-green-600' : ''}
              ${toast.type === 'warning' ? 'bg-orange-500' : ''}
              ${toast.type === 'error' ? 'bg-red-600' : ''}
              ${toast.type === 'info' ? 'bg-blue-600' : ''}
            `}
            onClick={() => removeToast(toast.id)}
          >
            <div className="flex justify-between items-center">
              <span>{toast.message}</span>
              <button className="ml-4 text-white hover:text-gray-200">×</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
