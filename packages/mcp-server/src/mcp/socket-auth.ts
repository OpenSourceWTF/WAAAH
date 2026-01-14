/**
 * Socket.io Authentication Middleware
 * 
 * Validates API key from socket handshake auth object.
 * Rejects unauthenticated connections with an error.
 */
import type { Socket, Server as SocketIOServer } from 'socket.io';
import type { ExtendedError } from 'socket.io/dist/namespace';
import { getOrCreateApiKey } from '../utils/auth.js';

/**
 * Socket.io middleware function type
 */
type SocketMiddleware = (socket: Socket, next: (err?: ExtendedError) => void) => void;

/**
 * Create Socket.io authentication middleware
 * 
 * @returns Middleware function that validates API key
 */
export function createSocketAuthMiddleware(): SocketMiddleware {
  const API_KEY = getOrCreateApiKey();

  return (socket, next) => {
    const providedKey = socket.handshake.auth?.apiKey;

    if (!providedKey) {
      const err = new Error('Authentication required: Missing API key') as ExtendedError;
      err.data = { code: 'AUTH_MISSING' };
      console.log(`[Socket] Connection rejected: Missing API key from ${socket.id}`);
      return next(err);
    }

    if (providedKey !== API_KEY) {
      const err = new Error('Authentication failed: Invalid API key') as ExtendedError;
      err.data = { code: 'AUTH_INVALID' };
      console.log(`[Socket] Connection rejected: Invalid API key from ${socket.id}`);
      return next(err);
    }

    console.log(`[Socket] Authenticated connection: ${socket.id}`);
    next();
  };
}

/**
 * Apply auth middleware to Socket.io server
 */
export function applySocketAuth(io: SocketIOServer): void {
  io.use(createSocketAuthMiddleware());
}
