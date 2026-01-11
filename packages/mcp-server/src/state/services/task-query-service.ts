import { Task, TaskStatus, StandardCapability } from '@opensourcewtf/waaah-types';
import type { ITaskRepository } from '../task-repository.js';
import type { QueuePersistence } from '../persistence/queue-persistence.js';

export class TaskQueryService {
  constructor(
    private readonly repo: ITaskRepository,
    private readonly persistence: QueuePersistence
  ) {}

  getTask(taskId: string): Task | undefined {
    return this.repo.getById(taskId) ?? undefined;
  }

  getTaskFromDB(taskId: string): Task | undefined {
    return this.repo.getById(taskId) || undefined;
  }

  getAll(): Task[] {
    return this.repo.getActive();
  }

  getStats(): { total: number; completed: number } {
    try {
      const stats = this.repo.getStats();
      return {
        total: stats.total,
        completed: stats.byStatus['COMPLETED'] || 0
      };
    } catch (e) {
      console.error("Failed to get queue stats", e);
      return { total: 0, completed: 0 };
    }
  }

  getByStatuses(statuses: TaskStatus[]): Task[] {
    return this.repo.getByStatuses(statuses);
  }

  getTaskHistory(options: {
    status?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
    search?: string;
  } = {}): Task[] {
    const { status, agentId, limit = 50, offset = 0, search } = options;
    return this.repo.getHistory({ status: status as TaskStatus | 'ACTIVE' | undefined, limit, offset, agentId, search });
  }

  getWaitingAgents(): Map<string, StandardCapability[]> {
    return this.persistence.getWaitingAgents();
  }

  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    return this.persistence.getPendingAcks();
  }

  getByStatus(status: TaskStatus): Task[] {
    return this.repo.getByStatus(status);
  }

  isAgentWaiting(agentId: string): boolean {
    return this.persistence.isAgentWaiting(agentId);
  }

  getBusyAgentIds(): string[] {
    const busyStatus: TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK'];
    const busyAgents = new Set<string>();

    for (const task of this.repo.getActive()) {
      if (busyStatus.includes(task.status) && task.to.agentId) {
        busyAgents.add(task.to.agentId);
      }
    }
    return Array.from(busyAgents);
  }

  getAssignedTasksForAgent(agentId: string): Task[] {
    const all = this.repo.getByAssignedTo(agentId);
    return all.filter(t => !['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'].includes(t.status));
  }

  getAgentLastSeen(agentId: string): number | undefined {
    return this.persistence.getAgentLastSeen(agentId);
  }

  getLogs(limit: number = 100): any[] {
    return this.persistence.getLogs(limit);
  }

  clear(): void {
    try {
      this.repo.clearAll();
      this.persistence.resetWaitingAgents();
      console.log('[TaskQueryService] Cleared all tasks');
    } catch (e: any) {
      console.error(`[TaskQueryService] Failed to clear tasks: ${e.message}`);
    }
  }
}
