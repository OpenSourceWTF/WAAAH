import { Task, TaskPriority, TaskStatus, AgentRole } from '@waaah/types';

// Configuration
const DEFAULT_POLL_TIMEOUT_MS = 300000; // 5 minutes
const ACK_TIMEOUT_MS = 60000; // 60 seconds
const DELIVERY_LOOP_INTERVAL_MS = 1000; // Check every 1 second
const REQUEUE_CHECK_INTERVAL_MS = 10000; // Check for stale PENDING_ACK every 10s

interface ConnectedAgent {
  agentId: string;
  role: AgentRole;
  resolver: (task: Task) => void;
  connectedAt: number;
  timeoutHandle: NodeJS.Timeout;
}

interface PendingAck {
  taskId: string;
  agentId: string;
  sentAt: number;
}

export class TaskQueue {
  private tasks: Map<string, Task> = new Map();
  private connectedAgents: Map<string, ConnectedAgent> = new Map();
  private pendingAcks: Map<string, PendingAck> = new Map();
  private adminListeners: Set<(task: Task) => void> = new Set();

  constructor() {
    this.startDeliveryLoop();
    this.startRequeueLoop();
    console.log('[Queue] Initialized with delivery manager');
  }

  // === DELIVERY LOOP ===
  // Proactively matches QUEUED tasks to connected agents
  private startDeliveryLoop(): void {
    setInterval(() => {
      this.runDeliveryPass();
    }, DELIVERY_LOOP_INTERVAL_MS);
  }

  private runDeliveryPass(): void {
    // Get all QUEUED tasks, sorted by priority
    const queuedTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'QUEUED')
      .sort((a, b) => this.getPriorityVal(b.priority) - this.getPriorityVal(a.priority));

    for (const task of queuedTasks) {
      const agent = this.findConnectedAgentForTask(task);
      if (agent) {
        this.dispatchTaskToAgent(task, agent);
      }
    }
  }

  private findConnectedAgentForTask(task: Task): ConnectedAgent | undefined {
    // If task targets a specific agent
    if (task.to.agentId) {
      return this.connectedAgents.get(task.to.agentId);
    }

    // If task targets a role, find any connected agent with that role
    if (task.to.role) {
      for (const agent of this.connectedAgents.values()) {
        if (agent.role === task.to.role) {
          return agent;
        }
      }
    }

    // Fallback: any connected agent
    const first = this.connectedAgents.values().next();
    return first.done ? undefined : first.value;
  }

  private dispatchTaskToAgent(task: Task, agent: ConnectedAgent): void {
    console.log(`[Queue] Dispatching task ${task.id} to ${agent.agentId}`);

    // Update task status
    task.status = 'PENDING_ACK';

    // Track pending ACK
    this.pendingAcks.set(task.id, {
      taskId: task.id,
      agentId: agent.agentId,
      sentAt: Date.now()
    });

    // Clear agent's timeout and remove from connected
    clearTimeout(agent.timeoutHandle);
    this.connectedAgents.delete(agent.agentId);

    // Resolve the agent's long-poll promise
    agent.resolver(task);

    // Notify admin listeners
    this.notifyAdminListeners(task);
  }

  // === REQUEUE LOOP ===
  // Reverts PENDING_ACK tasks back to QUEUED if not ACKed in time
  private startRequeueLoop(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [taskId, pending] of this.pendingAcks.entries()) {
        if (now - pending.sentAt > ACK_TIMEOUT_MS) {
          console.log(`[Queue] Task ${taskId} not ACKed within ${ACK_TIMEOUT_MS}ms, requeuing...`);
          this.requeueTask(taskId);
        }
      }
    }, REQUEUE_CHECK_INTERVAL_MS);
  }

  private requeueTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'PENDING_ACK') {
      task.status = 'QUEUED';
      this.pendingAcks.delete(taskId);
      console.log(`[Queue] Task ${taskId} requeued`);
      this.notifyAdminListeners(task);
    }
  }

  // === PUBLIC API ===

  enqueue(task: Task): void {
    this.tasks.set(task.id, task);
    console.log(`[Queue] Enqueued task ${task.id} (Priority: ${task.priority})`);
    this.notifyAdminListeners(task);
    // Delivery loop will pick it up on next pass
  }

  // Long-polling: agent registers to wait for a task
  waitForTask(agentId: string, role: AgentRole, timeoutMs?: number): Promise<Task | null> {
    const timeout = timeoutMs || DEFAULT_POLL_TIMEOUT_MS;

    return new Promise((resolve) => {
      // Check if agent is already connected (shouldn't happen, but handle gracefully)
      const existing = this.connectedAgents.get(agentId);
      if (existing) {
        clearTimeout(existing.timeoutHandle);
        this.connectedAgents.delete(agentId);
      }

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        console.log(`[Queue] Agent ${agentId} poll timed out after ${timeout}ms`);
        this.connectedAgents.delete(agentId);
        resolve(null);
      }, timeout);

      // Register as connected
      this.connectedAgents.set(agentId, {
        agentId,
        role,
        resolver: resolve,
        connectedAt: Date.now(),
        timeoutHandle
      });

      console.log(`[Queue] Agent ${agentId} connected, waiting for task (timeout: ${timeout}ms)`);
    });
  }

  // Agent acknowledges task receipt
  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: `Task status is ${task.status}, expected PENDING_ACK` };
    }

    const pending = this.pendingAcks.get(taskId);
    if (!pending) {
      return { success: false, error: 'No pending ACK found' };
    }

    if (pending.agentId !== agentId) {
      return { success: false, error: `Task sent to ${pending.agentId}, not ${agentId}` };
    }

    // Transition to ASSIGNED
    task.status = 'ASSIGNED';
    this.pendingAcks.delete(taskId);
    console.log(`[Queue] Task ${taskId} ACKed by ${agentId}`);

    return { success: true };
  }

  // Update task status (used by send_response)
  updateStatus(taskId: string, status: TaskStatus, responseData?: {
    message: string;
    artifacts?: string[];
    blockedReason?: string;
  }): void {
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
      console.log(`[Queue] Task ${taskId} -> ${status}`);
      this.notifyAdminListeners(task);
    }
  }

  // === ADMIN API ===

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getConnectedAgents(): string[] {
    return Array.from(this.connectedAgents.keys());
  }

  waitForEvent(timeoutMs: number = 30000): Promise<Task | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(null);
      }, timeoutMs);

      const listener = (task: Task) => {
        clearTimeout(timer);
        this.adminListeners.delete(listener);
        resolve(task);
      };

      this.adminListeners.add(listener);
    });
  }

  // === HELPERS ===

  private notifyAdminListeners(task: Task): void {
    this.adminListeners.forEach(listener => listener(task));
    this.adminListeners.clear();
  }

  private getPriorityVal(p: TaskPriority): number {
    switch (p) {
      case 'critical': return 3;
      case 'high': return 2;
      case 'normal': return 1;
      default: return 0;
    }
  }
}
