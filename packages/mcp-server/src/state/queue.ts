import { EventEmitter } from 'events';
import {
  Task,
  TaskStatus,
  AgentRole
} from '@waaah/types';
import { db } from './db.js';

const ACK_TIMEOUT_MS = 60000;         // 60s to ACK a task before it's requeued
const REQUEUE_CHECK_INTERVAL_MS = 10000; // Check every 10s

export class TaskQueue extends EventEmitter {
  // In-memory cache for fast access, but source of truth is DB
  private tasks: Map<string, Task> = new Map();
  // Map<TaskId, { agentId, sentAt }>
  private pendingAcks: Map<string, { taskId: string, agentId: string, sentAt: number }> = new Map();
  // Track agents currently long-polling (WAITING state)
  private waitingAgents: Set<string> = new Set();

  constructor() {
    super();
    this.loadFromDB();
    this.startRequeueLoop();
  }

  private loadFromDB(): void {
    // Load active tasks (QUEUED, PENDING_ACK, ASSIGNED, IN_PROGRESS)
    // We might want COMPLETED for history, but for queue logic we need active.
    const rows = db.prepare(`
      SELECT * FROM tasks 
      WHERE status IN ('QUEUED', 'PENDING_ACK', 'ASSIGNED', 'IN_PROGRESS')
    `).all() as any[];

    for (const row of rows) {
      const task = this.mapRowToTask(row);
      this.tasks.set(task.id, task);

      if (task.status === 'PENDING_ACK') {
        // If it was PENDING_ACK on restart, we should probably reset it to QUEUED
        // because the agent connection is gone.
        // OR we load it into pendingAcks and see if it times out immediately?
        // Let's reset to QUEUED to be safe, as the agent is definitely disconnected.
        console.log(`[Queue] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.updateStatus(task.id, 'QUEUED');
      }
    }
    console.log(`[Queue] Loaded ${this.tasks.size} active tasks from DB`);
  }

  enqueue(task: Task): void {
    this.tasks.set(task.id, task);

    try {
      db.prepare(`
        INSERT INTO tasks (
          id, status, prompt, priority, 
          fromAgentId, fromAgentName, 
          toAgentId, toAgentRole, 
          context, createdAt
        ) VALUES (
          @id, @status, @prompt, @priority, 
          @fromAgentId, @fromAgentName, 
          @toAgentId, @toAgentRole, 
          @context, @createdAt
        )
      `).run({
        id: task.id,
        status: task.status,
        prompt: task.prompt,
        priority: task.priority,
        fromAgentId: task.from.id,
        fromAgentName: task.from.name,
        toAgentId: task.to.agentId || null,
        toAgentRole: task.to.role || null,
        context: JSON.stringify(task.context || {}),
        createdAt: task.createdAt
      });
      console.log(`[Queue] Enqueued task: ${task.id} (${task.status})`);

      // Emit event for waiting agents
      this.emit('task', task);
    } catch (e: any) {
      console.error(`[Queue] Failed to persist task ${task.id}: ${e.message}`);
    }
  }

  // Find a task for a specific agent based on ID or Role
  // Default timeout: 290s (Antigravity has 300s hard limit)
  async waitForTask(agentId: string, role: AgentRole, timeoutMs: number = 290000): Promise<Task | null> {
    // Track this agent as waiting
    this.waitingAgents.add(agentId);

    return new Promise((resolve) => {
      // 1. Check if there are pending tasks for this agent
      const pendingTask = this.findPendingTaskForAgent(agentId, role);
      if (pendingTask) {
        this.waitingAgents.delete(agentId);
        this.updateStatus(pendingTask.id, 'PENDING_ACK');
        this.pendingAcks.set(pendingTask.id, {
          taskId: pendingTask.id,
          agentId,
          sentAt: Date.now()
        });
        resolve(pendingTask);
        return;
      }

      // 2. Use EventEmitter for instant notification
      let resolved = false;

      const onTask = (task: Task) => {
        if (resolved) return;
        // Check if this task is for this agent
        const isForMe = this.isTaskForAgent(task, agentId, role);
        if (isForMe && task.status === 'QUEUED') {
          resolved = true;
          cleanup();
          this.waitingAgents.delete(agentId);
          this.updateStatus(task.id, 'PENDING_ACK');
          this.pendingAcks.set(task.id, {
            taskId: task.id,
            agentId,
            sentAt: Date.now()
          });
          resolve(task);
        }
      };

      const cleanup = () => {
        this.off('task', onTask);
        this.waitingAgents.delete(agentId);
      };

      this.on('task', onTask);

      // Timeout after the specified duration
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          console.log(`[Queue] Wait timed out for agent ${agentId} after ${timeoutMs}ms`);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  private isTaskForAgent(task: Task, agentId: string, role: AgentRole): boolean {
    if (task.to.agentId && task.to.agentId === agentId) return true;
    if (task.to.role && task.to.role === role) return true;
    if (!task.to.agentId && !task.to.role) return true; // Any agent
    return false;
  }

  // Acknowledge task receipt - transitions PENDING_ACK -> ASSIGNED
  ackTask(taskId: string, agentId: string): { success: boolean, error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    // Allow re-ACK if already assigned extendedly? No.
    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: `Task status is ${task.status}, expected PENDING_ACK` };
    }

    const pending = this.pendingAcks.get(taskId);
    if (!pending) {
      // Maybe it was already removed?
      // Be lenient if status is PENDING_ACK but map is empty (shouldn't happen)
      return { success: false, error: 'No pending ACK found for task' };
    }

    if (pending.agentId !== agentId) {
      return { success: false, error: `Task was sent to ${pending.agentId}, not ${agentId}` };
    }

    // Transition to ASSIGNED
    task.assignedTo = agentId;
    this.updateStatus(taskId, 'ASSIGNED');
    this.pendingAcks.delete(taskId);
    console.log(`[Queue] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);

    return { success: true };
  }

  // Wait for a specific task to complete (used for dependency coordination)
  async waitForTaskCompletion(taskId: string, timeoutMs: number = 300000): Promise<Task | null> {
    return new Promise((resolve) => {
      let resolved = false;

      // Check if already complete
      const existingTask = this.getTask(taskId) || this.getTaskFromDB(taskId);
      if (existingTask && ['COMPLETED', 'FAILED', 'BLOCKED'].includes(existingTask.status)) {
        console.log(`[Queue] Task ${taskId} already complete (${existingTask.status})`);
        resolve(existingTask);
        return;
      }

      // Listen for completion events
      const onCompletion = (task: Task) => {
        if (task.id === taskId && !resolved) {
          resolved = true;
          this.off('completion', onCompletion);
          console.log(`[Queue] Task ${taskId} completed with status ${task.status}`);
          resolve(task);
        }
      };

      this.on('completion', onCompletion);

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.off('completion', onCompletion);
          console.log(`[Queue] Wait for task ${taskId} timed out after ${timeoutMs}ms`);
          // Return current state even if not complete
          const task = this.getTask(taskId) || this.getTaskFromDB(taskId);
          resolve(task || null);
        }
      }, timeoutMs);
    });
  }

  updateStatus(taskId: string, status: TaskStatus, response?: any): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      if (response) {
        task.response = response;
        task.completedAt = Date.now(); // or failedAt
      }

      this.persistUpdate(task);

      // Emit completion event for listeners (like the bot)
      if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(status)) {
        this.emit('completion', task);
        console.log(`[Queue] Emitted completion event for task ${taskId} (${status})`);
      }
    }
  }

  private persistUpdate(task: Task): void {
    const updates: string[] = ['status = @status'];
    const params: any = { id: task.id, status: task.status };

    if (task.response) {
      updates.push('response = @response');
      params.response = JSON.stringify(task.response);
    }
    if (task.completedAt) {
      updates.push('completedAt = @completedAt');
      params.completedAt = task.completedAt;
    }

    try {
      db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = @id`).run(params);
    } catch (e: any) {
      console.error(`[Queue] Failed to update task ${task.id}: ${e.message}`);
    }
  }

  // Re-queue tasks that timed out
  private requeueTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      this.updateStatus(taskId, 'QUEUED');
      this.pendingAcks.delete(taskId);
      console.log(`[Queue] Re-queued task ${taskId}`);
    }
  }

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

  private findPendingTaskForAgent(agentId: string, role: string): Task | undefined {
    // Priority: QUEUED tasks targeting this agent explicitly -> targeting role -> global?
    // Sort by priority (critical > high > normal) and age (oldest first)

    // Naive iteration for now
    const candidates = Array.from(this.tasks.values()).filter(t => t.status === 'QUEUED');

    // Sort candidates
    candidates.sort((a, b) => {
      const pScores: Record<string, number> = { critical: 3, high: 2, normal: 1 };
      const scoreA = pScores[a.priority] || 1;
      const scoreB = pScores[b.priority] || 1;
      if (scoreA !== scoreB) return scoreB - scoreA; // Higher priority first
      return a.createdAt - b.createdAt; // Older first
    });

    for (const task of candidates) {
      // 1. Direct assignment
      if (task.to.agentId === agentId) return task;
      // 2. Role assignment (if no specific agentId)
      if (!task.to.agentId && task.to.role === role) return task;
      // 3. Round robin? Not implemented yet.
    }

    return undefined;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  clear(): void {
    this.tasks.clear();
    this.pendingAcks.clear();
    try {
      db.prepare('DELETE FROM tasks').run();
      console.log('[Queue] Cleared all tasks');
    } catch (e: any) {
      console.error(`[Queue] Failed to clear tasks: ${e.message}`);
    }
  }

  mapRowToTask(row: any): Task {
    return {
      id: row.id,
      status: row.status as TaskStatus,
      command: 'execute_prompt', // or stored? Assume execute_prompt for stored tasks
      prompt: row.prompt,
      priority: row.priority || 'normal',
      from: {
        type: 'agent', // simplified
        id: row.fromAgentId,
        name: row.fromAgentName
      },
      to: {
        agentId: row.toAgentId,
        role: row.toAgentRole
      },
      context: JSON.parse(row.context || '{}'),
      response: row.response ? JSON.parse(row.response) : undefined,
      createdAt: row.createdAt,
      completedAt: row.completedAt
    };
  }

  // ===== Agent Status Helpers =====

  /** Get all agents currently long-polling */
  getWaitingAgents(): string[] {
    return Array.from(this.waitingAgents);
  }

  /** Check if a specific agent is currently waiting */
  isAgentWaiting(agentId: string): boolean {
    return this.waitingAgents.has(agentId);
  }

  /** Get tasks assigned to or in-progress for an agent */
  getAssignedTasksForAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(t =>
      (t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'PENDING_ACK') &&
      t.to.agentId === agentId
    );
  }

  /** Query task history from database (includes COMPLETED/FAILED) */
  getTaskHistory(options: {
    status?: string;
    agentId?: string;
    limit?: number;
    offset?: number;
  } = {}): Task[] {
    const { status, agentId, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any = {};

    if (status) {
      query += ' AND status = @status';
      params.status = status;
    }
    if (agentId) {
      query += ' AND (toAgentId = @agentId OR fromAgentId = @agentId)';
      params.agentId = agentId;
    }

    query += ' ORDER BY createdAt DESC LIMIT @limit OFFSET @offset';
    params.limit = limit;
    params.offset = offset;

    const rows = db.prepare(query).all(params) as any[];
    return rows.map(row => this.mapRowToTask(row));
  }

  /** Get a specific task from database (even if not in memory) */
  getTaskFromDB(taskId: string): Task | undefined {
    const row = db.prepare('SELECT * FROM tasks WHERE id = @id').get({ id: taskId }) as any;
    return row ? this.mapRowToTask(row) : undefined;
  }
}
