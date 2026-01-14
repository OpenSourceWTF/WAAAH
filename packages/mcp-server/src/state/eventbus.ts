/**
 * EventBus - WebSocket event emission for real-time updates
 * 
 * Emits events to connected Socket.io clients when data changes.
 * Called by TaskRepository on state changes.
 * 
 * Features:
 * - Sequence numbers for gap detection
 * - Debug logging with stack traces
 * - Request sync handler for reconnection recovery
 */
import type { Server as SocketIOServer } from 'socket.io';
import type { Task, AgentIdentity } from '@opensourcewtf/waaah-types';

let io: SocketIOServer | null = null;
let eventSeq = 0;
const DEBUG_EVENTS = process.env.DEBUG_EVENTS === 'true';

/**
 * Initialize the EventBus with the Socket.io server instance
 */
export function initEventBus(socketServer: SocketIOServer): void {
  io = socketServer;
  console.log('[EventBus] Initialized');

  // Handle reconnection sync requests
  io.on('connection', (socket) => {
    socket.on('request:sync', () => {
      console.log(`[EventBus] Sync requested by ${socket.id}`);
      // Emit will be handled by socket-service which has access to queue/registry
      socket.emit('sync:request_ack', { seq: eventSeq });
    });
  });
}

/**
 * Get the Socket.io server instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Get current sequence number (for sync verification)
 */
export function getEventSeq(): number {
  return eventSeq;
}

/**
 * Emit sync:full to a specific socket (on connection)
 */
export function emitSyncFull(socketId: string, data: { tasks: Task[]; agents: AgentIdentity[] }): void {
  if (!io) return;
  io.to(socketId).emit('sync:full', { ...data, seq: eventSeq });
  console.log(`[EventBus] sync:full to ${socketId} (${data.tasks.length} tasks, ${data.agents.length} agents, seq=${eventSeq})`);
}

/**
 * Emit task created event
 */
export function emitTaskCreated(task: Task): void {
  if (!io) return;
  const seq = ++eventSeq;
  io.emit('task:created', { ...task, seq });

  if (DEBUG_EVENTS) {
    console.log(`[EventBus DEBUG] task:created ${task.id} seq=${seq}`, new Error().stack?.split('\n').slice(1, 4).join('\n'));
  } else {
    console.log(`[EventBus] task:created ${task.id} seq=${seq}`);
  }
}

/**
 * Emit task updated event (patch payload)
 */
export function emitTaskUpdated(taskId: string, patch: Record<string, unknown>): void {
  if (!io) return;
  const seq = ++eventSeq;
  io.emit('task:updated', { id: taskId, seq, ...patch });

  if (DEBUG_EVENTS) {
    console.log(`[EventBus DEBUG] task:updated ${taskId} seq=${seq}`, patch, new Error().stack?.split('\n').slice(1, 4).join('\n'));
  } else {
    console.log(`[EventBus] task:updated ${taskId} seq=${seq}`);
  }
}

/**
 * Emit task deleted event
 */
export function emitTaskDeleted(taskId: string): void {
  if (!io) return;
  const seq = ++eventSeq;
  io.emit('task:deleted', { id: taskId, seq });
  console.log(`[EventBus] task:deleted ${taskId} seq=${seq}`);
}

/**
 * Emit agent status event
 */
export function emitAgentStatus(agentId: string, status: string, lastSeen: number): void {
  if (!io) return;
  const seq = ++eventSeq;
  io.emit('agent:status', { id: agentId, status, lastSeen, seq });
  console.log(`[EventBus] agent:status ${agentId} -> ${status} seq=${seq}`);
}
