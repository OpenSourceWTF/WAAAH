import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgentData } from '../../src/hooks/useAgentData';

// Mock API
vi.mock('../../src/lib/api', () => ({
  apiFetch: vi.fn()
}));

import { apiFetch } from '../../src/lib/api';

describe('useAgentData', () => {
  const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches agent data', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ([
        { id: 'agent-1', status: 'PROCESSING', lastSeen: Date.now() },
        { id: 'agent-2', status: 'OFFLINE' }
      ])
    });

    const { result } = renderHook(() => useAgentData());

    await waitFor(() => {
      expect(result.current.agents).toHaveLength(2);
    });

    expect(result.current.agentCounts.total).toBe(2);
    expect(result.current.agentCounts.processing).toBe(1);
    expect(result.current.agentCounts.offline).toBe(1);
  });

  it('calculates status color correctly', () => {
    const { result } = renderHook(() => useAgentData());
    const { getAgentStatusColor } = result.current;

    expect(getAgentStatusColor({ id: '1', status: 'OFFLINE', role: 'dev', displayName: 'Dev' })).toBe('gray');
    expect(getAgentStatusColor({ id: '1', status: 'PROCESSING', role: 'dev', displayName: 'Dev' })).toBe('yellow');
    
    const now = Date.now();
    // Active (WAITING + recent)
    expect(getAgentStatusColor({ id: '1', status: 'WAITING', lastSeen: now, role: 'dev', displayName: 'Dev' })).toBe('green');
    // Stale (WAITING + old)
    expect(getAgentStatusColor({ id: '1', status: 'WAITING', lastSeen: now - 61000, role: 'dev', displayName: 'Dev' })).toBe('red');
  });

  it('formats relative time', () => {
    const { result } = renderHook(() => useAgentData());
    const { getRelativeTime } = result.current;
    const now = Date.now();

    expect(getRelativeTime(now - 500)).toBe('Just now');
    expect(getRelativeTime(now - 5000)).toBe('5s ago');
    expect(getRelativeTime(now - 120000)).toBe('2m ago');
    expect(getRelativeTime(now - 7200000)).toBe('2h ago');
    expect(getRelativeTime(now - 172800000)).toBe('2d ago');
    expect(getRelativeTime(undefined)).toBe('Never');
  });
});
