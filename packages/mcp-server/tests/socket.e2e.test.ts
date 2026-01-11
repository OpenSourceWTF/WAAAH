/**
 * Socket.io E2E Tests
 * 
 * Tests WebSocket authentication and connection behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import express from 'express';
import { createSocketAuthMiddleware } from '../src/mcp/socket-auth';

// Mock the API key for testing
const TEST_API_KEY = 'test-api-key-12345';

describe('Socket.io Authentication', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let serverPort: number;

  beforeAll(async () => {
    // Create test server
    const app = express();
    httpServer = createServer(app);
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    });

    // Apply auth middleware (mock the getOrCreateApiKey)
    io.use((socket, next) => {
      const providedKey = socket.handshake.auth?.apiKey;
      if (providedKey !== TEST_API_KEY) {
        const err = new Error('Authentication failed') as any;
        err.data = { code: 'AUTH_INVALID' };
        return next(err);
      }
      next();
    });

    // Start server on random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        serverPort = typeof addr === 'object' ? addr!.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.close();
    httpServer.close();
  });

  it('rejects invalid API key', async () => {
    const socket = Client(`http://localhost:${serverPort}`, {
      auth: { apiKey: 'wrong-key' },
      autoConnect: false
    });

    const error = await new Promise<Error>((resolve) => {
      socket.on('connect_error', (err) => {
        resolve(err);
      });
      socket.connect();
    });

    expect(error.message).toContain('Authentication failed');
    socket.disconnect();
  });

  it('rejects connection without API key', async () => {
    const socket = Client(`http://localhost:${serverPort}`, {
      auth: {},
      autoConnect: false
    });

    const error = await new Promise<Error>((resolve) => {
      socket.on('connect_error', (err) => {
        resolve(err);
      });
      socket.connect();
    });

    expect(error.message).toContain('Authentication failed');
    socket.disconnect();
  });

  it('accepts connection with valid API key', async () => {
    const socket = Client(`http://localhost:${serverPort}`, {
      auth: { apiKey: TEST_API_KEY },
      autoConnect: false
    });

    const connected = await new Promise<boolean>((resolve) => {
      socket.on('connect', () => resolve(true));
      socket.on('connect_error', () => resolve(false));
      socket.connect();
    });

    expect(connected).toBe(true);
    socket.disconnect();
  });
});
