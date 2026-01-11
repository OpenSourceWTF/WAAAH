import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTaskData } from '../../src/hooks/useTaskData';

// Mock the API module
vi.mock('../../src/lib/api', () => ({
  apiFetch: vi.fn()
}));

import { apiFetch } from '../../src/lib/api';

describe('useTaskData', () => {
  const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and returns task data', async () => {
    // Mock responses for the 5 concurrent calls
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes('/admin/tasks?active=true')) {
        return { ok: true, json: async () => [{ id: '1', status: 'IN_PROGRESS' }] };
      }
      if (url.includes('/admin/bot/status')) {
        return { ok: true, json: async () => ({ count: 5 }) };
      }
      if (url.includes('/admin/stats')) {
        return { ok: true, json: async () => ({ completed: 10, total: 20 }) };
      }
      if (url.includes('status=COMPLETED')) {
        return { ok: true, json: async () => [{ id: '2', status: 'COMPLETED' }] };
      }
      if (url.includes('status=CANCELLED')) {
        return { ok: true, json: async () => [{ id: '3', status: 'CANCELLED' }] };
      }
      return { ok: false };
    });

    const { result } = renderHook(() => useTaskData({ pollInterval: 1000 }));

    // Initial state
    expect(result.current.activeTasks).toEqual([]);
    expect(result.current.connected).toBe(true); // default

    // Wait for data update
    await waitFor(() => {
      expect(result.current.activeTasks).toHaveLength(1);
    });

    expect(result.current.activeTasks[0].id).toBe('1');
    expect(result.current.botCount).toBe(5);
    expect(result.current.stats.completed).toBe(10);
    expect(result.current.recentCompleted).toHaveLength(1);
    expect(result.current.recentCancelled).toHaveLength(1);
  });

  it('handles connection error', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTaskData({ pollInterval: 1000 }));

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });
  });

  it('loads more completed tasks', async () => {
     // Setup initial fetch
     mockApiFetch.mockImplementation(async (url: string) => {
      if (url.includes('/admin/tasks?active=true')) return { ok: true, json: async () => [] };
      if (url.includes('status=COMPLETED')) {
        // Initial load returns 1 item
        if (url.includes('offset=0')) return { ok: true, json: async () => [{ id: '1', status: 'COMPLETED' }] };
        // Load more returns another item
        if (url.includes('offset=1')) return { ok: true, json: async () => [{ id: '2', status: 'COMPLETED' }] };
      }
      return { ok: true, json: async () => ({}) };
    });

    const { result } = renderHook(() => useTaskData({ pageSize: 1 }));

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.recentCompleted).toHaveLength(1);
    });

    // Trigger load more
    await result.current.loadMoreCompleted();

    await waitFor(() => {
      expect(result.current.recentCompleted).toHaveLength(2);
      expect(result.current.recentCompleted[1].id).toBe('2');
    });
  });

  it('loads more cancelled tasks', async () => {
    // Setup initial fetch
    mockApiFetch.mockImplementation(async (url: string) => {
     if (url.includes('/admin/tasks?active=true')) return { ok: true, json: async () => [] };
     if (url.includes('status=CANCELLED')) {
       // Initial load returns 1 item
       if (url.includes('offset=0')) return { ok: true, json: async () => [{ id: '1', status: 'CANCELLED' }] };
       // Load more returns another item
       if (url.includes('offset=1')) return { ok: true, json: async () => [{ id: '2', status: 'CANCELLED' }] };
     }
     return { ok: true, json: async () => ({}) };
   });

   const { result } = renderHook(() => useTaskData({ pageSize: 1 }));

   // Wait for initial load
   await waitFor(() => {
     expect(result.current.recentCancelled).toHaveLength(1);
   });

   // Trigger load more
   await result.current.loadMoreCancelled();

   await waitFor(() => {
     expect(result.current.recentCancelled).toHaveLength(2);
     expect(result.current.recentCancelled[1].id).toBe('2');
   });
 });
});
