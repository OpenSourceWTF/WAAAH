import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api';

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
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

/** Compare and update state only if data differs (JSON comparison) */
function updateIfChanged<T>(
  newData: T,
  prevRef: React.MutableRefObject<string>,
  setter: React.Dispatch<React.SetStateAction<T>>
) {
  const newJson = JSON.stringify(newData);
  if (newJson !== prevRef.current) {
    prevRef.current = newJson;
    setter(newData);
  }
}

export function useTaskData(options: UseTaskDataOptions = {}) {
  const { pollInterval = 2000, search = '', pageSize = DEFAULT_PAGE_SIZE } = options;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [recentCompleted, setRecentCompleted] = useState<Task[]>([]);
  const [recentCancelled, setRecentCancelled] = useState<Task[]>([]);
  const [connected, setConnected] = useState(true);

  const [completedOffset, setCompletedOffset] = useState(0);
  const [cancelledOffset, setCancelledOffset] = useState(0);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [hasMoreCancelled, setHasMoreCancelled] = useState(true);
  const [loadingMore, setLoadingMore] = useState<'completed' | 'cancelled' | null>(null);

  const [botCount, setBotCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, completed: 0 });

  const prevTasksRef = useRef<string>('');
  const prevCompletedRef = useRef<string>('');
  const prevCancelledRef = useRef<string>('');
  const prevStatsRef = useRef<string>('');

  const fetchTaskData = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

    try {
      const [tasksRes, botRes, statsRes, completedRes, cancelledRes] = await Promise.all([
        apiFetch(`/admin/tasks?active=true&limit=1000${searchParam}`, { signal: controller.signal }),
        apiFetch(`/admin/bot/status`, { signal: controller.signal }),
        apiFetch(`/admin/stats`, { signal: controller.signal }),
        apiFetch(`/admin/tasks?limit=${pageSize}&offset=0&status=COMPLETED${searchParam}`, { signal: controller.signal }),
        apiFetch(`/admin/tasks?limit=${pageSize}&offset=0&status=CANCELLED${searchParam}`, { signal: controller.signal })
      ]);

      clearTimeout(timeoutId);

      if (!tasksRes.ok) { setConnected(false); return; }
      setConnected(true);

      updateIfChanged(await tasksRes.json(), prevTasksRef, setTasks);
      if (botRes.ok) setBotCount((await botRes.json()).count);
      if (statsRes.ok) updateIfChanged(await statsRes.json(), prevStatsRef, setStats);

      if (completedRes.ok) {
        const data = await completedRes.json();
        updateIfChanged(data, prevCompletedRef, setRecentCompleted);
        setCompletedOffset(0);
        setHasMoreCompleted(data.length >= pageSize);
      }

      if (cancelledRes.ok) {
        const data = await cancelledRes.json();
        updateIfChanged(data, prevCancelledRef, setRecentCancelled);
        setCancelledOffset(0);
        setHasMoreCancelled(data.length >= pageSize);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Task fetch error:', e);
      setConnected(false);
    }
  }, [search, pageSize]);

  /** Generic loadMore for completed/cancelled swimlanes */
  const loadMore = useCallback(async (
    status: 'COMPLETED' | 'CANCELLED',
    currentOffset: number,
    setOffset: React.Dispatch<React.SetStateAction<number>>,
    setItems: React.Dispatch<React.SetStateAction<Task[]>>,
    setHasMore: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    setLoadingMore(status.toLowerCase() as 'completed' | 'cancelled');
    const newOffset = currentOffset + pageSize;
    const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

    try {
      const res = await apiFetch(`/admin/tasks?limit=${pageSize}&offset=${newOffset}&status=${status}${searchParam}`);
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setItems(prev => [...prev, ...data]);
          setOffset(newOffset);
          setHasMore(data.length >= pageSize);
        } else {
          setHasMore(false);
        }
      }
    } catch (e) {
      console.error(`Error loading more ${status} tasks:`, e);
    } finally {
      setLoadingMore(null);
    }
  }, [pageSize, search]);

  const loadMoreCompleted = useCallback(() => {
    if (loadingMore || !hasMoreCompleted) return;
    loadMore('COMPLETED', completedOffset, setCompletedOffset, setRecentCompleted, setHasMoreCompleted);
  }, [completedOffset, hasMoreCompleted, loadingMore, loadMore]);

  const loadMoreCancelled = useCallback(() => {
    if (loadingMore || !hasMoreCancelled) return;
    loadMore('CANCELLED', cancelledOffset, setCancelledOffset, setRecentCancelled, setHasMoreCancelled);
  }, [cancelledOffset, hasMoreCancelled, loadingMore, loadMore]);

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
    tasks, activeTasks, recentCompleted, recentCancelled, botCount, stats, connected,
    refetch: fetchTaskData,
    loadMoreCompleted, loadMoreCancelled, hasMoreCompleted, hasMoreCancelled, loadingMore
  };
}
