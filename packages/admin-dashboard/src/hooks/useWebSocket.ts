/**
 * useWebSocket Hook
 * 
 * Manages WebSocket connection for real-time updates.
 * Follows Socket.io + API key auth pattern from spec.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_KEY, BASE_URL } from '../lib/api';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface SyncFullPayload {
  tasks: unknown[];
  agents: unknown[];
}

export interface UseWebSocketOptions {
  /** Callback when sync:full event is received (initial state on connect) */
  onSyncFull?: (data: SyncFullPayload) => void;
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
}

export interface UseWebSocketResult {
  /** Current connection status */
  status: WebSocketStatus;
  /** Subscribe to a socket event, returns unsubscribe function */
  subscribe: <T = unknown>(event: string, handler: (data: T) => void) => () => void;
  /** Last error if status is 'error' */
  error: Error | null;
  /** Manually connect (if autoConnect is false) */
  connect: () => void;
  /** Manually disconnect */
  disconnect: () => void;
}

/**
 * React hook for WebSocket connection management.
 * 
 * - Handles connection, disconnection, reconnection
 * - Provides subscribe(event, handler) function
 * - Handles sync:full event for initial state
 * 
 * @example
 * ```tsx
 * const { status, subscribe } = useWebSocket({
 *   onSyncFull: (data) => setInitialState(data)
 * });
 * 
 * useEffect(() => {
 *   const unsubscribe = subscribe('task:*:updated', (patch) => {
 *     updateTask(patch);
 *   });
 *   return unsubscribe;
 * }, [subscribe]);
 * ```
 */
export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketResult {
  const { onSyncFull, autoConnect = true } = options;

  const [status, setStatus] = useState<WebSocketStatus>('connecting');
  const [error, setError] = useState<Error | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const onSyncFullRef = useRef(onSyncFull);

  // Keep onSyncFull ref up to date
  useEffect(() => {
    onSyncFullRef.current = onSyncFull;
  }, [onSyncFull]);

  // Initialize socket connection
  useEffect(() => {
    const socket = io(BASE_URL, {
      auth: {
        apiKey: API_KEY
      },
      autoConnect,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socketRef.current = socket;

    // Connection handlers
    socket.on('connect', () => {
      setStatus('connected');
      setError(null);
    });

    socket.on('disconnect', () => {
      setStatus('disconnected');
    });

    socket.on('connect_error', (err: Error) => {
      setStatus('error');
      setError(err);
    });

    // Handle sync:full for initial state
    socket.on('sync:full', (data: SyncFullPayload) => {
      onSyncFullRef.current?.(data);
    });

    // Cleanup on unmount
    return () => {
      socket.disconnect();
      socket.removeAllListeners();
      socketRef.current = null;
    };
  }, [autoConnect]);

  /**
   * Subscribe to a socket event
   * Returns an unsubscribe function
   */
  const subscribe = useCallback(<T = unknown>(
    event: string,
    handler: (data: T) => void
  ): (() => void) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn('[useWebSocket] Cannot subscribe: socket not initialized');
      return () => { };
    }

    socket.on(event, handler as (data: unknown) => void);

    // Return unsubscribe function
    return () => {
      socket.off(event, handler as (data: unknown) => void);
    };
  }, []);

  /**
   * Manually connect the socket
   */
  const connect = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  /**
   * Manually disconnect the socket
   */
  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  return {
    status,
    subscribe,
    error,
    connect,
    disconnect
  };
}
