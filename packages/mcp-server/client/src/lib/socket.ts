/**
 * Socket.io client connection setup
 * 
 * Provides a singleton socket instance with API key authentication.
 * Handles connection, reconnection, and error events.
 */
import { io, Socket } from 'socket.io-client';

// Server URL - uses same origin when in production
const SOCKET_URL = import.meta.env.VITE_API_URL || '';

// API key from environment
const API_KEY = import.meta.env.VITE_WAAAH_API_KEY;

/**
 * Socket.io event types for type safety
 */
export interface ServerToClientEvents {
  'sync:full': (data: { tasks: any[]; agents: any[] }) => void;
  'task:created': (task: any) => void;
  'task:updated': (data: { id: string;[key: string]: any }) => void;
  'task:deleted': (data: { id: string }) => void;
  'agent:status': (data: { id: string; status: string; lastSeen: number }) => void;
  'error': (data: { code: string; message: string }) => void;
}

export interface ClientToServerEvents {
  // Future: client-initiated events
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

// Export the socket instance as default
export default getSocket;
