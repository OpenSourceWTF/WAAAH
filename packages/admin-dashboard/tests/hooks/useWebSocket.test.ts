import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Create mock socket before mocking the module
const mockSocket = {
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  removeAllListeners: vi.fn(),
  connected: false
};

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}));

// Mock api module
vi.mock('../../src/lib/api', () => ({
  API_KEY: 'test-api-key',
  BASE_URL: 'http://localhost:3000'
}));

// Import after mocking
import { useWebSocket } from '../../src/hooks/useWebSocket';

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
    mockSocket.on.mockReturnThis();
    mockSocket.off.mockReturnThis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connection management', () => {
    it('starts with connecting status', () => {
      const { result } = renderHook(() => useWebSocket());

      expect(result.current.status).toBe('connecting');
    });

    it('updates status to connected on connect event', async () => {
      const handlers: Record<string, () => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: () => void) => {
        handlers[event] = handler;
        return mockSocket;
      });

      const { result } = renderHook(() => useWebSocket());

      // Simulate connect event
      act(() => {
        mockSocket.connected = true;
        handlers['connect']?.();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });
    });

    it('updates status to disconnected on disconnect event', async () => {
      const handlers: Record<string, () => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: () => void) => {
        handlers[event] = handler;
        return mockSocket;
      });

      const { result } = renderHook(() => useWebSocket());

      // First connect
      act(() => {
        mockSocket.connected = true;
        handlers['connect']?.();
      });

      // Then disconnect
      act(() => {
        mockSocket.connected = false;
        handlers['disconnect']?.();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('disconnected');
      });
    });

    it('disconnects socket on unmount', () => {
      const { unmount } = renderHook(() => useWebSocket());

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('subscribe function', () => {
    it('registers event handler', () => {
      const { result } = renderHook(() => useWebSocket());
      const handler = vi.fn();

      act(() => {
        result.current.subscribe('task:abc:updated', handler);
      });

      expect(mockSocket.on).toHaveBeenCalledWith('task:abc:updated', expect.any(Function));
    });

    it('returns unsubscribe function', () => {
      const { result } = renderHook(() => useWebSocket());
      const handler = vi.fn();
      let unsubscribe: (() => void) | undefined;

      act(() => {
        unsubscribe = result.current.subscribe('task:abc:updated', handler);
      });

      act(() => {
        unsubscribe?.();
      });

      expect(mockSocket.off).toHaveBeenCalledWith('task:abc:updated', expect.any(Function));
    });
  });

  describe('sync:full handling', () => {
    it('calls onSyncFull callback when sync:full event received', async () => {
      const handlers: Record<string, (data: unknown) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
        handlers[event] = handler;
        return mockSocket;
      });

      const onSyncFull = vi.fn();
      renderHook(() => useWebSocket({ onSyncFull }));

      const mockState = { tasks: [], agents: [] };

      act(() => {
        handlers['sync:full']?.(mockState);
      });

      expect(onSyncFull).toHaveBeenCalledWith(mockState);
    });
  });

  describe('error handling', () => {
    it('updates status to error on connect_error event', async () => {
      const handlers: Record<string, (err?: Error) => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: (err?: Error) => void) => {
        handlers[event] = handler;
        return mockSocket;
      });

      const { result } = renderHook(() => useWebSocket());

      act(() => {
        handlers['connect_error']?.(new Error('Connection refused'));
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error?.message).toBe('Connection refused');
      });
    });
  });

  describe('reconnection', () => {
    it('handles reconnection automatically', async () => {
      const handlers: Record<string, () => void> = {};
      mockSocket.on.mockImplementation((event: string, handler: () => void) => {
        handlers[event] = handler;
        return mockSocket;
      });

      const { result } = renderHook(() => useWebSocket());

      // Connect -> Disconnect -> Reconnect
      act(() => {
        mockSocket.connected = true;
        handlers['connect']?.();
      });

      act(() => {
        mockSocket.connected = false;
        handlers['disconnect']?.();
      });

      act(() => {
        mockSocket.connected = true;
        handlers['connect']?.();
      });

      await waitFor(() => {
        expect(result.current.status).toBe('connected');
      });
    });
  });
});
