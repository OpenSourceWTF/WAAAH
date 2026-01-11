/**
 * EventBus - WebSocket event emission for real-time updates
 * 
 * Emits events to connected Socket.io clients when data changes.
 * Called by queue.ts and agent-repository.ts on state changes.
 */
import type { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

/**
 * Initialize the EventBus with the Socket.io server instance
 */
export function initEventBus(socketServer: SocketIOServer): void {
  io = socketServer;
  console.log('[EventBus] Initialized');
}

/**
 * Get the Socket.io server instance
 */
export function getIO(): SocketIOServer | null {
  return io;
}

/**
 * Emit sync:full to a specific socket (on connection)
 */
export function emitSyncFull(socketId: string, data: { tasks: any[]; agents: any[] }): void {
  if (!io) return;
  io.to(socketId).emit('sync:full', data);
  console.log(`[EventBus] sync:full to ${socketId} (${data.tasks.length} tasks, ${data.agents.length} agents)`);
}

/**
 * Emit task created event
 */
export function emitTaskCreated(task: any): void {
  if (!io) return;
  io.emit('task:created', task);
  console.log(`[EventBus] task:created ${task.id}`);
}

/**
 * Emit task updated event (patch payload)
 */
export function emitTaskUpdated(taskId: string, patch: Record<string, unknown>): void {
  if (!io) return;
  io.emit('task:updated', { id: taskId, ...patch });
  console.log(`[EventBus] task:updated ${taskId}`);
}

/**
 * Emit task deleted event
 */
export function emitTaskDeleted(taskId: string): void {
  if (!io) return;
  io.emit('task:deleted', { id: taskId });
  console.log(`[EventBus] task:deleted ${taskId}`);
}

/**
 * Emit agent status event
 */
export function emitAgentStatus(agentId: string, status: string, lastSeen: number): void {
  if (!io) return;
  io.emit('agent:status', { id: agentId, status, lastSeen });
  console.log(`[EventBus] agent:status ${agentId} -> ${status}`);
}
