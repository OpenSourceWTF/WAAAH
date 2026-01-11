import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAgentData } from '../../src/hooks/useAgentData';

// Mock socket module BEFORE importing
vi.mock('../../src/lib/socket', () => ({
  getSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connected: false
  })),
  connectSocket: vi.fn()
}));

// Mock API module
vi.mock('../../src/lib/api', () => ({
  apiFetch: vi.fn()
}));

import { apiFetch } from '../../src/lib/api';

describe('useAgentData', () => {
  const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty array
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => []
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches agent data on mount', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ([
        { id: 'agent-1', status: 'PROCESSING', lastSeen: Date.now(), role: 'dev', displayName: 'Dev1' },
        { id: 'agent-2', status: 'OFFLINE', role: 'qa', displayName: 'QA' }
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

  it('handles fetch failure gracefully', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAgentData());

    // Should not throw, just return empty
    await waitFor(() => {
      expect(result.current.agents).toEqual([]);
    });
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

  it('gets agent initials', () => {
    const { result } = renderHook(() => useAgentData());
    const { getAgentInitials } = result.current;

    expect(getAgentInitials({ id: '1', displayName: 'Full Stack', role: 'dev', status: 'WAITING' })).toBe('FS');
    expect(getAgentInitials({ id: '1', displayName: 'Developer', role: 'dev', status: 'WAITING' })).toBe('DE');
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
