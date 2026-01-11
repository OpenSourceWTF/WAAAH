import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Task } from '../types';
import * as fetcher from '../lib/task-fetcher';

interface UseTaskDataOptions {
  pollInterval?: number;
  search?: string;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

export function useTaskData(options: UseTaskDataOptions = {}) {
  const { pollInterval = 2000, search = '', pageSize = DEFAULT_PAGE_SIZE } = options;

  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Task[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Task[]>([]);
  const [connected, setConnected] = useState(true);
  const [botCount, setBotCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, completed: 0 });

  // Pagination State
  const [completedOffset, setCompletedOffset] = useState(0);
  const [cancelledOffset, setCancelledOffset] = useState(0);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [hasMoreCancelled, setHasMoreCancelled] = useState(true);
  const [loadingMore, setLoadingMore] = useState<'completed' | 'cancelled' | null>(null);

  // Refs for deduplication
  const prevTasksRef = useRef<string>('');
  const prevCompletedRef = useRef<string>('');
  const prevCancelledRef = useRef<string>('');
  const prevStatsRef = useRef<string>('');

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

  const fetchTaskData = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const [tasksData, botData, statsData, completedData, cancelledData] = await Promise.all([
        fetcher.fetchActiveTasks(search, controller.signal),
        fetcher.fetchBotStatus(controller.signal),
        fetcher.fetchStats(controller.signal),
        fetcher.fetchPaginatedTasks('COMPLETED', pageSize, 0, search, controller.signal),
        fetcher.fetchPaginatedTasks('CANCELLED', pageSize, 0, search, controller.signal)
      ]);

      clearTimeout(timeoutId);
      setConnected(true);

      updateIfChanged(tasksData, prevTasksRef, setTasks);
      setBotCount(botData.active ? 1 : 0);
      updateIfChanged(statsData, prevStatsRef, setStats);

      // Only update paginated lists if we are at offset 0 (polling updates head)
      if (completedOffset === 0) {
        updateIfChanged(completedData, prevCompletedRef, setRecentCompleted);
        setHasMoreCompleted(completedData.length >= pageSize);
      }

      if (cancelledOffset === 0) {
        updateIfChanged(cancelledData, prevCancelledRef, setRecentCancelled);
        setHasMoreCancelled(cancelledData.length >= pageSize);
      }

    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Task fetch error:', e);
      setConnected(false);
    }
  }, [updateIfChanged, search, pageSize, completedOffset, cancelledOffset]);

  const loadMoreCompleted = useCallback(async () => {
    if (loadingMore || !hasMoreCompleted) return;
    setLoadingMore('completed');
    const newOffset = completedOffset + pageSize;

    try {
      const data = await fetcher.fetchPaginatedTasks('COMPLETED', pageSize, newOffset, search);
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

  const loadMoreCancelled = useCallback(async () => {
    if (loadingMore || !hasMoreCancelled) return;
    setLoadingMore('cancelled');
    const newOffset = cancelledOffset + pageSize;

    try {
      const data = await fetcher.fetchPaginatedTasks('CANCELLED', pageSize, newOffset, search);
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

  useEffect(() => {
    fetchTaskData();
    const interval = setInterval(fetchTaskData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchTaskData, pollInterval]);

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
    loadMoreCompleted,
    loadMoreCancelled,
    hasMoreCompleted,
    hasMoreCancelled,
    loadingMore
  };
}