/**
 * useTaskData - WebSocket-based task data hook
 * 
 * Uses Socket.io events for real-time updates instead of polling.
 * REST is retained for pagination (loadMore).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { getSocket, connectSocket } from '../lib/socket';

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
  const [connected, setConnected] = useState(false);

  const [completedOffset, setCompletedOffset] = useState(0);
  const [cancelledOffset, setCancelledOffset] = useState(0);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [hasMoreCancelled, setHasMoreCancelled] = useState(true);
  const [loadingMore, setLoadingMore] = useState<'completed' | 'cancelled' | null>(null);

  const [botCount, setBotCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, completed: 0 });

  const initialFetchDone = useRef(false);

  /** Initial data fetch via REST (for bot status and stats) */
  const fetchInitialData = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const [botRes, statsRes] = await Promise.all([
        apiFetch(`/admin/bot/status`, { signal: controller.signal }),
        apiFetch(`/admin/stats`, { signal: controller.signal })
      ]);

      clearTimeout(timeoutId);

      if (botRes.ok) setBotCount((await botRes.json()).count);
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      clearTimeout(timeoutId);
      console.error('Initial data fetch error:', e);
    }
  }, []);

  /** Generic loadMore for completed/cancelled swimlanes (REST-based) */
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

  /** WebSocket event handling */
  useEffect(() => {
    const socket = getSocket();
    // NOTE: connectSocket() is called AFTER handlers are registered (below)

    // Handle connection status
    const handleConnect = () => {
      console.log('[useTaskData] Socket connected');
      setConnected(true);
    };

    const handleDisconnect = () => {
      console.log('[useTaskData] Socket disconnected');
      setConnected(false);
    };

    // Handle full sync (initial data from server)
    const handleSyncFull = (data: { tasks: Task[]; agents: unknown[] }) => {
      console.log('[useTaskData] Received sync:full with', data.tasks.length, 'tasks');
      console.log('[useTaskData] Raw tasks:', data.tasks);

      // Separate tasks by status
      const active: Task[] = [];
      const completed: Task[] = [];
      const cancelled: Task[] = [];

      for (const task of data.tasks) {
        console.log(`[useTaskData] Task ${task.id} status: ${task.status}`);
        if (task.status === 'COMPLETED') {
          completed.push(task);
        } else if (task.status === 'CANCELLED') {
          cancelled.push(task);
        } else {
          active.push(task);
        }
      }

      console.log(`[useTaskData] Categorized: ${active.length} active, ${completed.length} completed, ${cancelled.length} cancelled`);
      setTasks(active);
      setRecentCompleted(completed.slice(0, pageSize));
      setRecentCancelled(cancelled.slice(0, pageSize));
      setHasMoreCompleted(completed.length >= pageSize);
      setHasMoreCancelled(cancelled.length >= pageSize);
      initialFetchDone.current = true;
    };

    // Handle task created
    const handleTaskCreated = (task: Task) => {
      console.log('[useTaskData] task:created', task.id);
      setTasks(prev => {
        // Avoid duplicates
        if (prev.some(t => t.id === task.id)) return prev;
        return [task, ...prev];
      });
    };

    // Handle task updated (patch merge)
    const handleTaskUpdated = (patch: { id: string;[key: string]: unknown }) => {
      console.log('[useTaskData] task:updated', patch.id, 'status:', patch.status);

      // Helper to apply patch
      const applyPatch = (tasks: Task[]): Task[] => {
        return tasks.map(t => {
          if (t.id === patch.id) {
            return { ...t, ...patch } as Task;
          }
          return t;
        });
      };

      // Check if status changed to completed/cancelled
      const newStatus = patch.status as string | undefined;

      if (newStatus === 'COMPLETED' || newStatus === 'CANCELLED') {
        // First check if task exists in active tasks
        setTasks(prev => {
          const task = prev.find(t => t.id === patch.id);
          if (task) {
            const updatedTask = { ...task, ...patch } as Task;
            if (newStatus === 'COMPLETED') {
              setRecentCompleted(prevCompleted => {
                // Avoid duplicates
                if (prevCompleted.some(t => t.id === patch.id)) {
                  return applyPatch(prevCompleted);
                }
                return [updatedTask, ...prevCompleted];
              });
            } else {
              setRecentCancelled(prevCancelled => {
                // Avoid duplicates
                if (prevCancelled.some(t => t.id === patch.id)) {
                  return applyPatch(prevCancelled);
                }
                return [updatedTask, ...prevCancelled];
              });
            }
            return prev.filter(t => t.id !== patch.id);
          }
          return prev;
        });

        // Also update if already in completed/cancelled arrays (status might be re-sent)
        if (newStatus === 'COMPLETED') {
          setRecentCompleted(applyPatch);
        } else {
          setRecentCancelled(applyPatch);
        }
      } else {
        // Non-terminal status - just update in place across all arrays
        setTasks(applyPatch);
        setRecentCompleted(applyPatch);
        setRecentCancelled(applyPatch);
      }
    };

    // Handle task deleted
    const handleTaskDeleted = (data: { id: string }) => {
      console.log('[useTaskData] task:deleted', data.id);
      setTasks(prev => prev.filter(t => t.id !== data.id));
      setRecentCompleted(prev => prev.filter(t => t.id !== data.id));
      setRecentCancelled(prev => prev.filter(t => t.id !== data.id));
    };

    // Subscribe to events
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('sync:full', handleSyncFull);
    socket.on('task:created', handleTaskCreated);
    socket.on('task:updated', handleTaskUpdated);
    socket.on('task:deleted', handleTaskDeleted);

    // Set initial connected state
    if (socket.connected) {
      setConnected(true);
    } else {
      // Connect AFTER handlers are registered to avoid race condition
      connectSocket();
    }

    // Fetch bot/stats data (not part of WebSocket sync)
    fetchInitialData();

    // Cleanup on unmount
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('sync:full', handleSyncFull);
      socket.off('task:created', handleTaskCreated);
      socket.off('task:updated', handleTaskUpdated);
      socket.off('task:deleted', handleTaskDeleted);
    };
  }, [fetchInitialData, pageSize]);

  const activeTasks = useMemo(() =>
    tasks.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(t.status)),
    [tasks]
  );

  // Manual refetch function for edge cases (triggers sync:full from server)
  const refetch = useCallback(() => {
    const socket = getSocket();
    if (socket.connected) {
      // If server supports request:sync, emit it
      // For now, reconnect to trigger sync:full
      socket.disconnect();
      socket.connect();
    }
    fetchInitialData();
  }, [fetchInitialData]);

  return {
    tasks, activeTasks, recentCompleted, recentCancelled, botCount, stats, connected,
    refetch,
    loadMoreCompleted, loadMoreCancelled, hasMoreCompleted, hasMoreCancelled, loadingMore
  };
}
