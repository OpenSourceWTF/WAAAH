/**
 * useTaskData - WebSocket-based task data hook
 * 
 * Uses Socket.io events for real-time updates instead of polling.
 * REST is retained for pagination (loadMore).
 * 
 * NOTE: CANCELLED tasks are soft-deleted and hidden from the UI.
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
  const [connected, setConnected] = useState(false);

  const [completedOffset, setCompletedOffset] = useState(0);
  const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
  const [loadingMore, setLoadingMore] = useState<'completed' | null>(null);

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

  /** Load more completed tasks (REST-based pagination) */
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
      console.error('Error loading more COMPLETED tasks:', e);
    } finally {
      setLoadingMore(null);
    }
  }, [completedOffset, hasMoreCompleted, loadingMore, pageSize, search]);

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
    // CANCELLED tasks are filtered out - they are soft-deleted and hidden from UI
    const handleSyncFull = (data: { tasks: Task[]; agents: unknown[]; seq?: number }) => {
      console.log('[useTaskData] Received sync:full with', data.tasks.length, 'tasks');

      // Reset sequence tracking after full sync
      if (data.seq !== undefined) {
        import('../lib/socket').then(({ resetSequence }) => resetSequence(data.seq!));
      }

      // Separate tasks by status - CANCELLED tasks are hidden
      const active: Task[] = [];
      const completed: Task[] = [];

      for (const task of data.tasks) {
        if (task.status === 'COMPLETED') {
          completed.push(task);
        } else if (task.status === 'CANCELLED') {
          // Skip cancelled tasks - they are soft-deleted
          continue;
        } else {
          active.push(task);
        }
      }

      console.log(`[useTaskData] Categorized: ${active.length} active, ${completed.length} completed (cancelled filtered out)`);
      setTasks(active);
      setRecentCompleted(completed.slice(0, pageSize));
      setHasMoreCompleted(completed.length >= pageSize);
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

      if (newStatus === 'COMPLETED') {
        // Move from active to completed
        setTasks(prev => {
          const task = prev.find(t => t.id === patch.id);
          if (task) {
            const updatedTask = { ...task, ...patch } as Task;
            setRecentCompleted(prevCompleted => {
              // Avoid duplicates
              if (prevCompleted.some(t => t.id === patch.id)) {
                return applyPatch(prevCompleted);
              }
              return [updatedTask, ...prevCompleted];
            });
            return prev.filter(t => t.id !== patch.id);
          }
          return prev;
        });
        setRecentCompleted(applyPatch);
      } else if (newStatus === 'CANCELLED') {
        // CANCELLED = soft-deleted, remove from all views
        setTasks(prev => prev.filter(t => t.id !== patch.id));
        setRecentCompleted(prev => prev.filter(t => t.id !== patch.id));
      } else {
        // Non-terminal status - just update in place
        setTasks(applyPatch);
        setRecentCompleted(applyPatch);
      }
    };

    // Handle task deleted (hard delete - also removes from views)
    const handleTaskDeleted = (data: { id: string }) => {
      console.log('[useTaskData] task:deleted', data.id);
      setTasks(prev => prev.filter(t => t.id !== data.id));
      setRecentCompleted(prev => prev.filter(t => t.id !== data.id));
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

  // Active tasks filter - excludes terminal states including CANCELLED
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
    tasks, activeTasks, recentCompleted, botCount, stats, connected,
    refetch,
    loadMoreCompleted, hasMoreCompleted, loadingMore
  };
}
