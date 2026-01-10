import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

/**
 * Task interface matching the Dashboard's Task type
 */
export interface Task {
  id: string;
  command: string;
  prompt: string;
  title?: string;
  status: string;
  text?: string;
  toAgentId?: string;
  toAgentRole?: string;
  response?: Record<string, unknown>;
  context?: Record<string, unknown>;
  history?: { timestamp: number; status: string; agentId?: string; message?: string }[];
  messages?: { timestamp: number; role: 'user' | 'agent' | 'system'; content: string; metadata?: Record<string, unknown> }[];
  createdAt?: number;
  completedAt?: number;
}

/**
 * Custom hook for task data fetching with deduplication to prevent animation interruptions.
 * Uses refs to compare new data with previous, only triggering re-renders on actual changes.
 * 
 * @param pollInterval - Polling interval in milliseconds (default: 2000)
 * @returns Task data and loading states
 */
export function useTaskData(pollInterval = 2000) {
  // State for tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Task[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Task[]>([]);
  const [connected, setConnected] = useState(true);

  // Stats
  const [botCount, setBotCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, completed: 0 });

  // Refs to store previous data for comparison (prevents re-renders)
  const prevTasksRef = useRef<string>('');
  const prevCompletedRef = useRef<string>('');
  const prevCancelledRef = useRef<string>('');
  const prevStatsRef = useRef<string>('');

  /**
   * Compare and update state only if data actually changed.
   * Uses JSON.stringify for deep comparison.
   */
  const updateIfChanged = useCallback(<T,>(
    newData: T,
    prevRef: React.MutableRefObject<string>,
    setter: React.Dispatch<React.SetStateAction<T>>
  ) => {
    const newJson = JSON.stringify(newData);
    if (newJson !== prevRef.current) {
      prevRef.current = newJson;
      setter(newData);
    }
  }, []);

  /**
   * Fetch all task-related data from the server
   */
  const fetchTaskData = useCallback(async () => {
    // Create abort controller with 3 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const baseUrl = 'http://localhost:3000';
      const [tasksRes, botRes, statsRes, recentRes, cancelledRes] = await Promise.all([
        fetch(`${baseUrl}/admin/tasks`, { signal: controller.signal }),
        fetch(`${baseUrl}/admin/bot/status`, { signal: controller.signal }),
        fetch(`${baseUrl}/admin/stats`, { signal: controller.signal }),
        fetch(`${baseUrl}/admin/tasks/history?limit=10&status=COMPLETED`, { signal: controller.signal }),
        fetch(`${baseUrl}/admin/tasks/history?limit=10&status=CANCELLED,FAILED`, { signal: controller.signal })
      ]);

      clearTimeout(timeoutId);

      // Check if primary endpoint is reachable - if not, we're disconnected
      if (!tasksRes.ok) {
        setConnected(false);
        return;
      }

      // Server is responding
      setConnected(true);

      const data = await tasksRes.json();
      updateIfChanged(data, prevTasksRef, setTasks);

      if (botRes.ok) {
        const data = await botRes.json();
        setBotCount(data.count);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        updateIfChanged(data, prevStatsRef, setStats);
      }

      if (recentRes.ok) {
        const data = await recentRes.json();
        updateIfChanged(data, prevCompletedRef, setRecentCompleted);
      }

      if (cancelledRes.ok) {
        const data = await cancelledRes.json();
        updateIfChanged(data, prevCancelledRef, setRecentCancelled);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Task fetch error:', e);
      setConnected(false);
    }
  }, [updateIfChanged]);

  // Polling effect
  useEffect(() => {
    fetchTaskData();
    const interval = setInterval(fetchTaskData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchTaskData, pollInterval]);

  // Memoized active tasks (non-terminal states)
  const activeTasks = useMemo(() =>
    tasks.filter(t => !['COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'].includes(t.status)),
    [tasks]
  );

  return {
    tasks,
    activeTasks,
    recentCompleted,
    recentCancelled,
    botCount,
    stats,
    connected,
    refetch: fetchTaskData
  };
}
