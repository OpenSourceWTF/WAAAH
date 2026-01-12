import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useTaskData } from '../../src/hooks/useTaskData';

// Mock the socket module
const mockSocket = {
  connected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('../../src/lib/socket', () => ({
  getSocket: () => mockSocket,
  connectSocket: vi.fn(() => {
    mockSocket.connected = true;
  }),
}));

// Mock the API module
vi.mock('../../src/lib/api', () => ({
  apiFetch: vi.fn()
}));

import { apiFetch } from '../../src/lib/api';

describe('useTaskData', () => {
  const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;
  let eventHandlers: Record<string, Function> = {};

  beforeEach(() => {
    mockApiFetch.mockReset();
    mockSocket.on.mockReset();
    mockSocket.off.mockReset();
    mockSocket.connect.mockReset();
    mockSocket.disconnect.mockReset();
    mockSocket.connected = true;
    eventHandlers = {};

    // Capture event handlers
    mockSocket.on.mockImplementation((event: string, handler: Function) => {
      eventHandlers[event] = handler;
    });

    // Default API mocks for bot/stats
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes('/admin/bot/status')) {
        return { ok: true, json: async () => ({ count: 5 }) };
      }
      if (url.includes('/admin/stats')) {
        return { ok: true, json: async () => ({ completed: 10, total: 20 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to socket events on mount', async () => {
    renderHook(() => useTaskData());

    // Verify socket event subscriptions
    expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('sync:full', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('task:created', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('task:updated', expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith('task:deleted', expect.any(Function));
  });

  it('handles sync:full event and populates tasks', async () => {
    const { result } = renderHook(() => useTaskData());

    // Simulate sync:full event
    act(() => {
      eventHandlers['sync:full']?.({
        tasks: [
          { id: '1', status: 'IN_PROGRESS', prompt: 'test' },
          { id: '2', status: 'COMPLETED', prompt: 'done' },
          { id: '3', status: 'CANCELLED', prompt: 'cancelled' },
        ],
        agents: []
      });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.activeTasks).toHaveLength(1);
      expect(result.current.recentCompleted).toHaveLength(1);
      expect(result.current.recentCancelled).toHaveLength(1);
    });
  });

  it('handles task:created event', async () => {
    const { result } = renderHook(() => useTaskData());

    // Initial state with no tasks
    expect(result.current.tasks).toHaveLength(0);

    // Simulate task:created event
    act(() => {
      eventHandlers['task:created']?.({ id: 'new-task', status: 'QUEUED', prompt: 'new task' });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.tasks[0].id).toBe('new-task');
    });
  });

  it('handles task:updated event with patch merge', async () => {
    const { result } = renderHook(() => useTaskData());

    // Add initial task via sync:full
    act(() => {
      eventHandlers['sync:full']?.({
        tasks: [{ id: 'task-1', status: 'QUEUED', prompt: 'initial' }],
        agents: []
      });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
    });

    // Simulate task:updated with status change
    act(() => {
      eventHandlers['task:updated']?.({ id: 'task-1', status: 'IN_PROGRESS' });
    });

    await waitFor(() => {
      expect(result.current.tasks[0].status).toBe('IN_PROGRESS');
    });
  });

  it('handles task:deleted event', async () => {
    const { result } = renderHook(() => useTaskData());

    // Add initial task
    act(() => {
      eventHandlers['sync:full']?.({
        tasks: [{ id: 'task-to-delete', status: 'QUEUED', prompt: 'delete me' }],
        agents: []
      });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
    });

    // Simulate task:deleted
    act(() => {
      eventHandlers['task:deleted']?.({ id: 'task-to-delete' });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(0);
    });
  });

  it('handles connection status changes', async () => {
    const { result } = renderHook(() => useTaskData());

    // Initial connected state (socket.connected = true)
    expect(result.current.connected).toBe(true);

    // Simulate disconnect
    act(() => {
      eventHandlers['disconnect']?.();
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });

    // Simulate reconnect
    act(() => {
      eventHandlers['connect']?.();
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it('loads more completed tasks via REST', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes('/admin/bot/status')) return { ok: true, json: async () => ({ count: 0 }) };
      if (url.includes('/admin/stats')) return { ok: true, json: async () => ({ total: 0, completed: 0 }) };
      if (url.includes('status=COMPLETED') && url.includes('offset=1')) {
        return { ok: true, json: async () => [{ id: 'more-1', status: 'COMPLETED' }] };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { result } = renderHook(() => useTaskData({ pageSize: 1 }));

    // Add initial completed task via sync:full - provide exactly pageSize items so hasMoreCompleted is true
    act(() => {
      eventHandlers['sync:full']?.({
        tasks: [{ id: 'completed-1', status: 'COMPLETED', prompt: 'first' }],
        agents: []
      });
    });

    await waitFor(() => {
      expect(result.current.recentCompleted).toHaveLength(1);
      expect(result.current.hasMoreCompleted).toBe(true);
    });

    // Trigger load more
    await act(async () => {
      await result.current.loadMoreCompleted();
    });

    await waitFor(() => {
      expect(result.current.recentCompleted).toHaveLength(2);
    });
  });

  it('loads more cancelled tasks via REST', async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes('/admin/bot/status')) return { ok: true, json: async () => ({ count: 0 }) };
      if (url.includes('/admin/stats')) return { ok: true, json: async () => ({ total: 0, completed: 0 }) };
      if (url.includes('status=CANCELLED') && url.includes('offset=1')) {
        return { ok: true, json: async () => [{ id: 'more-cancelled-1', status: 'CANCELLED' }] };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { result } = renderHook(() => useTaskData({ pageSize: 1 }));

    // Add initial cancelled task via sync:full - provide exactly pageSize items so hasMoreCancelled is true
    act(() => {
      eventHandlers['sync:full']?.({
        tasks: [{ id: 'cancelled-1', status: 'CANCELLED', prompt: 'first' }],
        agents: []
      });
    });

    await waitFor(() => {
      expect(result.current.recentCancelled).toHaveLength(1);
      expect(result.current.hasMoreCancelled).toBe(true);
    });

    // Trigger load more
    await act(async () => {
      await result.current.loadMoreCancelled();
    });

    await waitFor(() => {
      expect(result.current.recentCancelled).toHaveLength(2);
    });
  });

  it('moves task from active to completed on status change', async () => {
    const { result } = renderHook(() => useTaskData());

    // Add active task via sync:full
    act(() => {
      eventHandlers['sync:full']?.({
        tasks: [{ id: 'active-task', status: 'IN_PROGRESS', prompt: 'working' }],
        agents: []
      });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(1);
      expect(result.current.recentCompleted).toHaveLength(0);
    });

    // Update to COMPLETED status
    act(() => {
      eventHandlers['task:updated']?.({ id: 'active-task', status: 'COMPLETED' });
    });

    await waitFor(() => {
      expect(result.current.tasks).toHaveLength(0);
      expect(result.current.recentCompleted).toHaveLength(1);
      expect(result.current.recentCompleted[0].id).toBe('active-task');
    });
  });

  it('unsubscribes from socket events on unmount', async () => {
    const { unmount } = renderHook(() => useTaskData());

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('sync:full', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('task:created', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('task:updated', expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith('task:deleted', expect.any(Function));
  });
});
