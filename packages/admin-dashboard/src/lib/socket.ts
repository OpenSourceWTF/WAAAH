/**
 * Socket.io client connection setup
 * 
 * Provides a singleton socket instance with API key authentication.
 * Handles connection, reconnection, and error events.
 * 
 * Features:
 * - Sequence tracking for gap detection
 * - Auto-resync on reconnect
 * - Request sync on sequence gaps
 */
import { io, Socket } from 'socket.io-client';

// Server URL - uses same origin when in production
const SOCKET_URL = import.meta.env.VITE_API_URL || '';

// API key from environment
const API_KEY = import.meta.env.VITE_WAAAH_API_KEY;

// Track last received sequence number for gap detection
let lastSeq = 0;
let syncRequested = false;

/**
 * Socket.io event types for type safety
 */
export interface ServerToClientEvents {
  'sync:full': (data: { tasks: any[]; agents: any[]; seq?: number }) => void;
  'sync:request_ack': (data: { seq: number }) => void;
  'task:created': (task: any & { seq?: number }) => void;
  'task:updated': (data: { id: string; seq?: number;[key: string]: any }) => void;
  'task:deleted': (data: { id: string; seq?: number }) => void;
  'agent:status': (data: { id: string; status: string; lastSeen: number; seq?: number }) => void;
  'error': (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  'request:sync': () => void;
}

/**
 * Check for sequence gap and request resync if needed
 */
function checkSequenceGap(seq: number | undefined, eventType: string): boolean {
  if (seq === undefined) return false; // Legacy event without seq

  if (lastSeq > 0 && seq !== lastSeq + 1 && !syncRequested) {
    console.warn(`[Socket] Sequence gap detected! Expected ${lastSeq + 1}, got ${seq} (${eventType}). Requesting resync...`);
    getSocket().emit('request:sync');
    syncRequested = true;
    return true; // Gap detected
  }

  lastSeq = seq;
  return false;
}

/**
 * Reset sequence tracking (after full sync)
 */
export function resetSequence(seq: number): void {
  lastSeq = seq;
  syncRequested = false;
  console.log(`[Socket] Sequence reset to ${seq}`);
}

/**
 * Get current sequence number
 */
export function getLastSeq(): number {
  return lastSeq;
}

/**
 * Create and configure the socket connection
 */
function createSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  const socket = io(SOCKET_URL, {
    auth: {
      apiKey: API_KEY
    },
    autoConnect: false, // Manual connect for lifecycle control
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });

  // Connection event handlers
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    // Request resync on reconnect to catch any missed events
    if (lastSeq > 0) {
      console.log('[Socket] Reconnected - requesting sync to catch missed events');
      socket.emit('request:sync');
      syncRequested = true;
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error.message);
  });

  socket.on('error', (data) => {
    console.error('[Socket] Server error:', data.code, data.message);
  });

  // Handle sync acknowledgment
  socket.on('sync:request_ack', (data) => {
    console.log(`[Socket] Sync request acknowledged, server seq=${data.seq}`);
    // Full sync will follow from socket-service
  });

  return socket;
}

// Singleton socket instance
let socketInstance: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * Get the socket instance (creates if needed)
 */
export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socketInstance) {
    socketInstance = createSocket();
  }
  return socketInstance;
}

/**
 * Connect the socket
 */
export function connectSocket(): void {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
}

/**
 * Disconnect the socket
 */
export function disconnectSocket(): void {
  if (socketInstance?.connected) {
    socketInstance.disconnect();
  }
}

/**
 * Check if socket is connected
 */
export function isSocketConnected(): boolean {
  return socketInstance?.connected ?? false;
}

// Export sequence checker for use in hooks
export { checkSequenceGap };

// Export the socket instance as default
export default getSocket;
