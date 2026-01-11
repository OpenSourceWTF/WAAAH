import { useState, useEffect, useMemo, useCallback } from 'react';
import { getSocket, connectSocket } from '../lib/socket';
import type { ServerToClientEvents } from '../lib/socket';
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
  search?: string;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 50;

export function useTaskData(options: UseTaskDataOptions = {}) {
  const { search = '', pageSize = DEFAULT_PAGE_SIZE } = options;

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

  // Initial data fetch
  const fetchTaskData = useCallback(async () => {
    const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';

    try {
      const [tasksRes, botRes, statsRes, completedRes, cancelledRes] = await Promise.all([
        apiFetch(`/admin/tasks?active=true&limit=1000${searchParam}`),
        apiFetch(`/admin/bot/status`),
        apiFetch(`/admin/stats`),
        apiFetch(`/admin/tasks?limit=${pageSize}&offset=0&status=COMPLETED${searchParam}`),
        apiFetch(`/admin/tasks?limit=${pageSize}&offset=0&status=CANCELLED${searchParam}`)
      ]);

      if (!tasksRes.ok) { setConnected(false); return; }
      setConnected(true);

      setTasks(await tasksRes.json());
      if (botRes.ok) setBotCount((await botRes.json()).count);
      if (statsRes.ok) setStats(await statsRes.json());

      if (completedRes.ok) {
        const data = await completedRes.json();
        setRecentCompleted(data);
        setCompletedOffset(0);
        setHasMoreCompleted(data.length >= pageSize);
      }

      if (cancelledRes.ok) {
        const data = await cancelledRes.json();
        setRecentCancelled(data);
        setCancelledOffset(0);
        setHasMoreCancelled(data.length >= pageSize);
      }
    } catch (e) {
      console.error('Task fetch error:', e);
      setConnected(false);
    }
  }, [search, pageSize]);

  // WebSocket subscription effect
  useEffect(() => {
    const socket = getSocket();
    connectSocket();

    // Initial fetch
    fetchTaskData();

    // Handle full sync on connect/reconnect
    const handleSync: ServerToClientEvents['sync:full'] = (data) => {
      if (data.tasks) {
        setTasks(data.tasks);
        setConnected(true);
      }
    };

    // Handle task creation
    const handleTaskCreated = (task: any) => {
      setTasks(prev => [task, ...prev]);
    };

    // Handle task updates (patch)
    const handleTaskUpdated = (patch: { id: string;[key: string]: any }) => {
      setTasks(prev => prev.map(t => t.id === patch.id ? { ...t, ...patch } : t));

      // Move to completed/cancelled swimlane if status changed
      if (patch.status === 'COMPLETED') {
        setTasks(prev => prev.filter(t => t.id !== patch.id));
        setRecentCompleted(prev => {
          const existing = prev.find(t => t.id === patch.id);
          const updated = { ...existing, ...patch, id: patch.id } as Task;
          return [updated, ...prev.filter(t => t.id !== patch.id)];
        });
      } else if (patch.status === 'CANCELLED') {
        setTasks(prev => prev.filter(t => t.id !== patch.id));
        setRecentCancelled(prev => {
          const existing = prev.find(t => t.id === patch.id);
          const updated = { ...existing, ...patch, id: patch.id } as Task;
          return [updated, ...prev.filter(t => t.id !== patch.id)];
        });
      }
    };

    // Handle task deletion
    const handleTaskDeleted = (data: { id: string }) => {
      setTasks(prev => prev.filter(t => t.id !== data.id));
      setRecentCompleted(prev => prev.filter(t => t.id !== data.id));
      setRecentCancelled(prev => prev.filter(t => t.id !== data.id));
    };

    socket.on('sync:full', handleSync);
    socket.on('task:created', handleTaskCreated);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('task:deleted', handleTaskDeleted);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.off('sync:full', handleSync);
      socket.off('task:created', handleTaskCreated);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('task:deleted', handleTaskDeleted);
      socket.off('connect');
      socket.off('disconnect');
    };
  }, [fetchTaskData]);

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
