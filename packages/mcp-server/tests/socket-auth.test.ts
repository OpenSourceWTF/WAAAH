/**
 * Socket Auth Tests
 * 
 * Tests for Socket.io authentication middleware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSocketAuthMiddleware, applySocketAuth } from '../src/mcp/socket-auth.js';

describe('createSocketAuthMiddleware', () => {
  beforeEach(() => {
    // Set API key for tests
    process.env.WAAAH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.WAAAH_API_KEY;
    vi.restoreAllMocks();
  });

  it('allows connection with valid API key', () => {
    const middleware = createSocketAuthMiddleware();
    const mockSocket = {
      id: 'socket-1',
      handshake: {
        auth: { apiKey: 'test-api-key' }
      }
    };
    const next = vi.fn();

    middleware(mockSocket as any, next);

    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects connection with missing API key', () => {
    const middleware = createSocketAuthMiddleware();
    const mockSocket = {
      id: 'socket-2',
      handshake: {
        auth: {}
      }
    };
    const next = vi.fn();

    middleware(mockSocket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Missing API key');
    expect(err.data.code).toBe('AUTH_MISSING');
  });

  it('rejects connection with invalid API key', () => {
    const middleware = createSocketAuthMiddleware();
    const mockSocket = {
      id: 'socket-3',
      handshake: {
        auth: { apiKey: 'wrong-key' }
      }
    };
    const next = vi.fn();

    middleware(mockSocket as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('Invalid API key');
    expect(err.data.code).toBe('AUTH_INVALID');
  });
});

describe('applySocketAuth', () => {
  beforeEach(() => {
    process.env.WAAAH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.WAAAH_API_KEY;
  });

  it('applies middleware to socket.io instance', () => {
    const mockIo = {
      use: vi.fn()
    };

    applySocketAuth(mockIo);

    expect(mockIo.use).toHaveBeenCalledWith(expect.any(Function));
  });
});
