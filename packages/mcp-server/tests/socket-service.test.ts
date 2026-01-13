/**
 * Socket Service Tests
 *
 * Tests for Socket.io service layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock socket.io Server
class MockSocket extends EventEmitter {
  id = 'socket-1';
}

class MockIOServer extends EventEmitter {
  sockets = new Map();

  constructor() {
    super();
  }

  // Simulate a connection
  simulateConnection(): MockSocket {
    const socket = new MockSocket();
    this.sockets.set(socket.id, socket);
    this.emit('connection', socket);
    return socket;
  }
}

// Mock the eventbus before importing SocketService
vi.mock('../src/state/eventbus.js', () => ({
  emitSyncFull: vi.fn()
}));

import { SocketService } from '../src/state/socket-service.js';
import { emitSyncFull } from '../src/state/eventbus.js';

describe('SocketService', () => {
  let mockIO: MockIOServer;
  let mockRegistry: any;
  let mockQueue: any;
  let service: SocketService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIO = new MockIOServer();

    mockRegistry = {
      getAll: vi.fn().mockReturnValue([
        { id: 'agent-1', displayName: 'Agent 1', role: 'developer', source: 'IDE', capabilities: [], createdAt: Date.now() },
        { id: 'agent-2', displayName: 'Agent 2', role: 'tester', source: 'CLI', capabilities: [], createdAt: Date.now() }
      ]),
      getLastSeen: vi.fn().mockReturnValue(Date.now())
    };

    mockQueue = {
      getAll: vi.fn().mockReturnValue([
        { id: 'task-1', status: 'QUEUED' }
      ]),
      getTaskHistory: vi.fn().mockReturnValue([]),
      getWaitingAgents: vi.fn().mockReturnValue(new Set()),
      getAssignedTasksForAgent: vi.fn().mockReturnValue([])
    };

    service = new SocketService(mockIO as any, mockRegistry as any, mockQueue);
  });

  describe('connection handling', () => {
    it('sets up connection listener on initialization', () => {
      expect(mockIO.listenerCount('connection')).toBe(1);
    });

    it('sends initial state on client connection', () => {
      const socket = mockIO.simulateConnection();

      expect(mockQueue.getAll).toHaveBeenCalled();
      expect(mockQueue.getTaskHistory).toHaveBeenCalledWith({ status: 'COMPLETED', limit: 50 });
      expect(mockQueue.getTaskHistory).toHaveBeenCalledWith({ status: 'CANCELLED', limit: 50 });
      expect(mockRegistry.getAll).toHaveBeenCalled();

      expect(emitSyncFull).toHaveBeenCalledWith(
        socket.id,
        expect.objectContaining({
          tasks: expect.any(Array),
          agents: expect.any(Array)
        })
      );
    });

    it('includes completed and cancelled tasks in initial sync', () => {
      mockQueue.getTaskHistory
        .mockReturnValueOnce([{ id: 'completed-1', status: 'COMPLETED' }])
        .mockReturnValueOnce([{ id: 'cancelled-1', status: 'CANCELLED' }]);

      mockIO.simulateConnection();

      expect(emitSyncFull).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tasks: expect.arrayContaining([
            expect.objectContaining({ id: 'task-1' }),
            expect.objectContaining({ id: 'completed-1' }),
            expect.objectContaining({ id: 'cancelled-1' })
          ])
        })
      );
    });

    it('logs on client connection', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockIO.simulateConnection();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Client connected'));
      consoleSpy.mockRestore();
    });

    it('logs on client disconnect', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const socket = mockIO.simulateConnection();
      socket.emit('disconnect');

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Client disconnected'));
      consoleSpy.mockRestore();
    });
  });

  describe('multiple connections', () => {
    it('handles multiple simultaneous connections', () => {
      const socket1 = mockIO.simulateConnection();
      const socket2 = mockIO.simulateConnection();

      // Each connection gets its own sync
      expect(emitSyncFull).toHaveBeenCalledTimes(2);
      expect(emitSyncFull).toHaveBeenCalledWith(socket1.id, expect.any(Object));
      expect(emitSyncFull).toHaveBeenCalledWith(socket2.id, expect.any(Object));
    });
  });
});
