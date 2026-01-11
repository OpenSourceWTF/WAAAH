import { Server as SocketIOServer } from 'socket.io';
import { AgentRepository } from './persistence/agent-repository.js';
import { TaskQueue } from './queue.js';
import { emitSyncFull } from './eventbus.js';

export class SocketService {
  constructor(
    private io: SocketIOServer,
    private registry: AgentRepository,
    private queue: TaskQueue
  ) {
    this.setupListeners();
  }

  private setupListeners() {
    this.io.on('connection', (socket) => {
      console.log(`[Socket] Client connected: ${socket.id}`);

      // Send initial state - include active + recent completed/cancelled
      const activeTasks = this.queue.getAll();
      const completedTasks = this.queue.getTaskHistory({ status: 'COMPLETED', limit: 50 });
      const cancelledTasks = this.queue.getTaskHistory({ status: 'CANCELLED', limit: 50 });
      const allTasks = [...activeTasks, ...completedTasks, ...cancelledTasks];
      const agents = this.registry.getAll();

      emitSyncFull(socket.id, { tasks: allTasks, agents });

      socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });
    });
  }
}
