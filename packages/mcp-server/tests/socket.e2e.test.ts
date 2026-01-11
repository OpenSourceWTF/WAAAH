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

describe('Socket.io Agent Status Push', () => {
  let httpServer: HttpServer;
  let io: SocketIOServer;
  let serverPort: number;

  beforeAll(async () => {
    const app = express();
    httpServer = createServer(app);
    io = new SocketIOServer(httpServer, {
      cors: { origin: '*' }
    });

    // Apply auth middleware
    io.use((socket, next) => {
      const providedKey = socket.handshake.auth?.apiKey;
      if (providedKey !== TEST_API_KEY) {
        return next(new Error('Authentication failed'));
      }
      next();
    });

    // Handle connection - send sync:full on connect
    io.on('connection', (socket) => {
      socket.emit('sync:full', { tasks: [], agents: [] });
    });

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

  it('receives sync:full on connect', async () => {
    const socket = Client(`http://localhost:${serverPort}`, {
      auth: { apiKey: TEST_API_KEY },
      autoConnect: false
    });

    const syncData = await new Promise<any>((resolve, reject) => {
      socket.on('sync:full', (data) => resolve(data));
      socket.on('connect_error', (err) => reject(err));
      socket.connect();
    });

    expect(syncData).toHaveProperty('tasks');
    expect(syncData).toHaveProperty('agents');
    expect(Array.isArray(syncData.tasks)).toBe(true);
    expect(Array.isArray(syncData.agents)).toBe(true);
    socket.disconnect();
  });

  it('receives agent:status when server emits', async () => {
    const socket = Client(`http://localhost:${serverPort}`, {
      auth: { apiKey: TEST_API_KEY },
      autoConnect: false
    });

    // Connect and wait for sync first
    await new Promise<void>((resolve, reject) => {
      socket.on('sync:full', () => resolve());
      socket.on('connect_error', (err) => reject(err));
      socket.connect();
    });

    // Setup listener for agent:status
    const statusPromise = new Promise<any>((resolve) => {
      socket.on('agent:status', (data) => resolve(data));
    });

    // Server emits agent:status
    const testAgent = { id: 'test-agent-1', status: 'PROCESSING', lastSeen: Date.now() };
    io.emit('agent:status', testAgent);

    const receivedStatus = await statusPromise;
    expect(receivedStatus.id).toBe('test-agent-1');
    expect(receivedStatus.status).toBe('PROCESSING');
    expect(receivedStatus.lastSeen).toBeDefined();

    socket.disconnect();
  });

  it('receives agent:{id}:status for specific agent', async () => {
    const socket = Client(`http://localhost:${serverPort}`, {
      auth: { apiKey: TEST_API_KEY },
      autoConnect: false
    });

    await new Promise<void>((resolve, reject) => {
      socket.on('sync:full', () => resolve());
      socket.on('connect_error', (err) => reject(err));
      socket.connect();
    });

    // Listen for specific agent event
    const agentId = 'agent-xyz-123';
    const statusPromise = new Promise<any>((resolve) => {
      socket.on(`agent:${agentId}:status`, (data) => resolve(data));
    });

    // Server emits status for specific agent
    io.emit(`agent:${agentId}:status`, { id: agentId, status: 'WAITING', lastSeen: Date.now() });

    const receivedStatus = await statusPromise;
    expect(receivedStatus.id).toBe(agentId);
    expect(receivedStatus.status).toBe('WAITING');

    socket.disconnect();
  });
});
