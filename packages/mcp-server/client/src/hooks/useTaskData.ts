import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api';

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

interface UseTaskDataOptions {
  pollInterval?: number;
  search?: string;
  pageSize?: number; // Items per page for pagination
}

const DEFAULT_PAGE_SIZE = 50;

/**
 * Custom hook for task data fetching with deduplication and infinite scroll support.
 * Uses refs to compare new data with previous, only triggering re-renders on actual changes.
 * 
 * @param options - Configuration options including pollInterval, search query, and pageSize
 * @returns Task data, loading states, and pagination controls
 */
export function useTaskData(options: UseTaskDataOptions = {}) {
  const { pollInterval = 2000, search = '', pageSize = DEFAULT_PAGE_SIZE } = options;

  // State for tasks
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Task[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Task[]>([]);
  const [connected, setConnected] = useState(true);

  // Pagination state for completed/cancelled swimlanes
  const [completedOffset, setCompletedOffset] = useState(0);
  const [cancelledOffset, setCancelledOffset] = useState(0);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [hasMoreCancelled, setHasMoreCancelled] = useState(true);
  const [loadingMore, setLoadingMore] = useState<'completed' | 'cancelled' | null>(null);

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
      // Build search query param
      const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

      // Fetch active tasks (with active=true for in-memory filtering + search)
      // plus paginated completed/cancelled from DB
      const [tasksRes, botRes, statsRes, completedRes, cancelledRes] = await Promise.all([
        apiFetch(`/admin/tasks?active=true&limit=1000${searchParam}`, { signal: controller.signal }),
        apiFetch(`/admin/bot/status`, { signal: controller.signal }),
        apiFetch(`/admin/stats`, { signal: controller.signal }),
        apiFetch(`/admin/tasks?limit=${pageSize}&offset=0&status=COMPLETED${searchParam}`, { signal: controller.signal }),
        apiFetch(`/admin/tasks?limit=${pageSize}&offset=0&status=CANCELLED${searchParam}`, { signal: controller.signal })
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

      if (completedRes.ok) {
        const data = await completedRes.json();
        updateIfChanged(data, prevCompletedRef, setRecentCompleted);
        // Reset pagination state since we're fetching from offset 0
        setCompletedOffset(0);
        setHasMoreCompleted(data.length >= pageSize);
      }

      if (cancelledRes.ok) {
        const data = await cancelledRes.json();
        updateIfChanged(data, prevCancelledRef, setRecentCancelled);
        // Reset pagination state since we're fetching from offset 0
        setCancelledOffset(0);
        setHasMoreCancelled(data.length >= pageSize);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Task fetch error:', e);
      setConnected(false);
    }
  }, [updateIfChanged, search, pageSize]);

  /**
   * Load more completed tasks (infinite scroll)
   */
  const loadMoreCompleted = useCallback(async () => {
    if (loadingMore || !hasMoreCompleted) return;

    setLoadingMore('completed');
    const newOffset = completedOffset + pageSize;
    const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

    try {
      const res = await apiFetch(`/admin/tasks?limit=${pageSize}&offset=${newOffset}&status=COMPLETED${searchParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setRecentCompleted(prev => [...prev, ...data]);
          setCompletedOffset(newOffset);
          setHasMoreCompleted(data.length >= pageSize);
        } else {
          setHasMoreCompleted(false);
        }
      }
    } catch (e) {
      console.error('Error loading more completed tasks:', e);
    } finally {
      setLoadingMore(null);
    }
  }, [completedOffset, hasMoreCompleted, loadingMore, pageSize, search]);

  /**
   * Load more cancelled tasks (infinite scroll)
   */
  const loadMoreCancelled = useCallback(async () => {
    if (loadingMore || !hasMoreCancelled) return;

    setLoadingMore('cancelled');
    const newOffset = cancelledOffset + pageSize;
    const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

    try {
      const res = await apiFetch(`/admin/tasks?limit=${pageSize}&offset=${newOffset}&status=CANCELLED${searchParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setRecentCancelled(prev => [...prev, ...data]);
          setCancelledOffset(newOffset);
          setHasMoreCancelled(data.length >= pageSize);
        } else {
          setHasMoreCancelled(false);
        }
      }
    } catch (e) {
      console.error('Error loading more cancelled tasks:', e);
    } finally {
      setLoadingMore(null);
    }
  }, [cancelledOffset, hasMoreCancelled, loadingMore, pageSize, search]);

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
    refetch: fetchTaskData,
    // Pagination controls
    loadMoreCompleted,
    loadMoreCancelled,
    hasMoreCompleted,
    hasMoreCancelled,
    loadingMore
  };
}
