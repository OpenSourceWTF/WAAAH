import { Server as SocketIOServer } from 'socket.io';
import { AgentRepository } from './persistence/agent-repository.js';
import { TaskQueue } from './queue.js';
import { emitSyncFull } from './eventbus.js';
import { determineAgentStatus } from './agent-status.js';
import type { AgentConnectionStatus } from '@opensourcewtf/waaah-types';

/**
 * Maps AgentConnectionStatus (UPPERCASE) to AgentIdentity.status (lowercase).
 * AgentConnectionStatus: 'OFFLINE' | 'WAITING' | 'PROCESSING'
 * AgentIdentity.status: 'idle' | 'busy' | 'offline'
 */
function mapToIdentityStatus(status: AgentConnectionStatus): 'idle' | 'busy' | 'offline' {
  switch (status) {
    case 'PROCESSING': return 'busy';
    case 'WAITING': return 'idle';
    case 'OFFLINE': return 'offline';
  }
}

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

      // Compute agent status (same logic as REST /agents/status endpoint)
      const rawAgents = this.registry.getAll();
      const waitingAgents = this.queue.getWaitingAgents();
      const agents = rawAgents.map(agent => {
        const assignedTasks = this.queue.getAssignedTasksForAgent(agent.id);
        const lastSeen = this.registry.getLastSeen(agent.id);
        const isWaiting = waitingAgents.has(agent.id);
        const connectionStatus = determineAgentStatus(assignedTasks, isWaiting, lastSeen);
        const status = mapToIdentityStatus(connectionStatus);

        return {
          id: agent.id,
          displayName: agent.displayName,
          role: agent.role || '',
          source: agent.source,
          status,
          lastSeen,
          createdAt: agent.createdAt,
          currentTasks: assignedTasks.map(t => t.id),
          capabilities: agent.capabilities || [],
          color: agent.color,
          workspaceContext: agent.workspaceContext
        };
      });

      emitSyncFull(socket.id, { tasks: allTasks, agents });

      socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
      });

      socket.on('request:sync', () => {
        console.log(`[EventBus] Sync requested by ${socket.id}`);
        // Re-compute and send fresh data
        const tasks = [...this.queue.getAll(),
        ...this.queue.getTaskHistory({ status: 'COMPLETED', limit: 50 }),
        ...this.queue.getTaskHistory({ status: 'CANCELLED', limit: 50 })];
        const waiting = this.queue.getWaitingAgents();
        const agentsData = this.registry.getAll().map(a => {
          const assigned = this.queue.getAssignedTasksForAgent(a.id);
          const seen = this.registry.getLastSeen(a.id);
          const connectionStatus = determineAgentStatus(assigned, waiting.has(a.id), seen);
          return {
            ...a,
            role: a.role || '',
            status: mapToIdentityStatus(connectionStatus),
            lastSeen: seen,
            currentTasks: assigned.map(t => t.id)
          };
        });
        emitSyncFull(socket.id, { tasks, agents: agentsData });
      });
    });
  }
}
