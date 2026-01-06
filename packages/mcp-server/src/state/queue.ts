import { Task, TaskPriority, TaskStatus, AgentRole } from '@waaah/types';

interface WaitingAgent {
  agentId: string;
  role: AgentRole;
  resolve: (task: Task) => void;
}

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private waitingAgents: Map<string, WaitingAgent> = new Map();
  private waitingAdminListeners: Set<(task: Task) => void> = new Set();

  enqueue(task: Task): void {
    this.tasks.set(task.id, task);

    // Notify admin listeners of new task
    this.notifyAdminListeners(task);

    // Check if task is targeted to a specific agent
    if (task.to.agentId) {
      if (this.tryDispatchToAgent(task.to.agentId, task)) {
        return;
      }
    }

    // Check if task is targeted to a role (any agent with this role)
    if (task.to.role) {
      if (this.tryDispatchToRole(task.to.role, task)) {
        return;
      }
    }

    console.log(`[Queue] Enqueued task: ${task.id} (Priority: ${task.priority})`);
  }

  private notifyAdminListeners(task: Task): void {
    this.waitingAdminListeners.forEach(listener => listener(task));
    this.waitingAdminListeners.clear();
  }

  // Admin/CLI event polling
  waitForEvent(timeoutMs: number = 30000): Promise<Task | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, timeoutMs);

      const listener = (task: Task) => {
        clearTimeout(timer);
        this.waitingAdminListeners.delete(listener);
        resolve(task);
      };

      this.waitingAdminListeners.add(listener);
    });
  }

  // Long-polling handler for agents
  waitForTask(agentId: string, role: AgentRole, timeoutMs: number = 30000): Promise<Task | null> {
    return new Promise((resolve) => {
      // 1. Check if there are pending tasks for this agent
      const pendingTask = this.findPendingTaskForAgent(agentId, role);
      if (pendingTask) {
        pendingTask.status = 'ASSIGNED';
        resolve(pendingTask);
        return;
      }

      // 2. Wait for new tasks
      const timer = setTimeout(() => {
        this.waitingAgents.delete(agentId);
        resolve(null); // Timeout
      }, timeoutMs);

      this.waitingAgents.set(agentId, {
        agentId,
        role,
        resolve: (task) => {
          clearTimeout(timer);
          task.status = 'ASSIGNED';
          resolve(task);
        }
      });
    });
  }

  private findPendingTaskForAgent(agentId: string, role: AgentRole): Task | undefined {
    // Priority sort
    const agentTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'QUEUED')
      .filter(t => {
        // Match by agentId if specified
        if (t.to.agentId) return t.to.agentId === agentId;
        // Match by role if specified
        if (t.to.role) return t.to.role === role;
        // Default: match any agent
        return true;
      })
      .sort((a, b) => this.getPriorityVal(b.priority) - this.getPriorityVal(a.priority));

    return agentTasks[0];
  }

  private tryDispatchToAgent(agentId: string, task: Task): boolean {
    const waiter = this.waitingAgents.get(agentId);
    if (waiter) {
      this.waitingAgents.delete(agentId);
      waiter.resolve(task);
      return true;
    }
    return false;
  }

  private tryDispatchToRole(role: AgentRole, task: Task): boolean {
    // Find any waiting agent with this role
    for (const [agentId, waiter] of this.waitingAgents.entries()) {
      if (waiter.role === role) {
        this.waitingAgents.delete(agentId);
        waiter.resolve(task);
        return true;
      }
    }
    return false;
  }

  private getPriorityVal(p: TaskPriority): number {
    switch (p) {
      case 'critical': return 3;
      case 'high': return 2;
      case 'normal': return 1;
      default: return 0;
    }
  }

  updateStatus(taskId: string, status: TaskStatus, responseData?: { message: string, artifacts?: string[], blockedReason?: string }): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (responseData) {
        task.response = {
          taskId,
          status,
          message: responseData.message,
          artifacts: responseData.artifacts,
          blockedReason: responseData.blockedReason,
          completedAt: Date.now()
        };
      }
      console.log(`[Queue] Update task ${taskId} -> ${status}`);

      // Notify admin listeners of status update
      this.notifyAdminListeners(task);
    }
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }
}
