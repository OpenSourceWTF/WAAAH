import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchActiveTasks, fetchBotStatus, fetchStats, fetchTaskHistory } from '../lib/taskService';
import type { Task } from '@/types';

export type { Task }; // Re-export for compatibility

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
  const fetchAllData = useCallback(async () => {
    // Create abort controller with 3 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const [activeTasksData, botData, statsData, completedData, cancelledData] = await Promise.all([
        fetchActiveTasks(search, controller.signal),
        fetchBotStatus(controller.signal),
        fetchStats(controller.signal),
        fetchTaskHistory('COMPLETED', pageSize, 0, search, controller.signal),
        fetchTaskHistory('CANCELLED', pageSize, 0, search, controller.signal)
      ]);

      clearTimeout(timeoutId);
      setConnected(true);

      updateIfChanged(activeTasksData, prevTasksRef, setTasks);
      setBotCount(botData.count);
      updateIfChanged(statsData, prevStatsRef, setStats);

      updateIfChanged(completedData, prevCompletedRef, setRecentCompleted);
      setCompletedOffset(0);
      setHasMoreCompleted(completedData.length >= pageSize);

      updateIfChanged(cancelledData, prevCancelledRef, setRecentCancelled);
      setCancelledOffset(0);
      setHasMoreCancelled(cancelledData.length >= pageSize);

    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error('Task fetch error:', e);
      // Only set disconnected if we failed to fetch active tasks (critical)
      // or if it's a network error (not abort)
      if (e.name !== 'AbortError') {
         setConnected(false);
      }
    }
  }, [updateIfChanged, search, pageSize]);

  /**
   * Load more completed tasks (infinite scroll)
   */
  const loadMoreCompleted = useCallback(async () => {
    if (loadingMore || !hasMoreCompleted) return;

    setLoadingMore('completed');
    const newOffset = completedOffset + pageSize;

    try {
      const data = await fetchTaskHistory('COMPLETED', pageSize, newOffset, search);
      if (data.length > 0) {
        setRecentCompleted(prev => [...prev, ...data]);
        setCompletedOffset(newOffset);
        setHasMoreCompleted(data.length >= pageSize);
      } else {
        setHasMoreCompleted(false);
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

    try {
      const data = await fetchTaskHistory('CANCELLED', pageSize, newOffset, search);
      if (data.length > 0) {
        setRecentCancelled(prev => [...prev, ...data]);
        setCancelledOffset(newOffset);
        setHasMoreCancelled(data.length >= pageSize);
      } else {
        setHasMoreCancelled(false);
      }
    } catch (e) {
      console.error('Error loading more cancelled tasks:', e);
    } finally {
      setLoadingMore(null);
    }
  }, [cancelledOffset, hasMoreCancelled, loadingMore, pageSize, search]);

  // Polling effect
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAllData, pollInterval]);

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
    refetch: fetchAllData,
    // Pagination controls
    loadMoreCompleted,
    loadMoreCancelled,
    hasMoreCompleted,
    hasMoreCancelled,
    loadingMore
  };
}