import type { Database } from 'better-sqlite3';
import type { Task, TaskStatus } from '@opensourcewtf/waaah-types';

/**
 * Interface for task repository operations.
 * Provides CRUD operations for tasks in the database.
 */
export interface ITaskRepository {
  /** Insert a new task into the database */
  insert(task: Task): void;
  /** Update an existing task */
  update(task: Task): void;
  /** Update only the status of a task */
  updateStatus(taskId: string, status: TaskStatus): void;
  /** Get a task by its ID */
  getById(taskId: string): Task | null;
  /** Get all active (non-terminal) tasks */
  getActive(): Task[];
  /** Get tasks by status */
  getByStatus(status: TaskStatus): Task[];
  /** Get tasks by multiple statuses */
  getByStatuses(statuses: TaskStatus[]): Task[];
  /** Get tasks assigned to a specific agent */
  getByAssignedTo(agentId: string): Task[];
  /** Get task history with filtering */
  getHistory(options: { status?: TaskStatus; limit?: number; offset?: number; agentId?: string }): Task[];
  /** Get queue statistics */
  getStats(): { total: number; byStatus: Record<string, number> };
  /** Add a message to a task */
  addMessage(taskId: string, role: string, content: string, metadata?: Record<string, any>): void;
  /** Get messages for a task */
  getMessages(taskId: string): Array<{ role: string; content: string; timestamp: number; metadata?: Record<string, any> }>;
  /** Clear all tasks (for testing) */
  clearAll(): void;
  /** Access to underlying database (for logging etc) */
  database: Database;
}

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'CANCELLED'];

/**
 * SQLite implementation of task repository.
 * Uses database as single source of truth.
 */
export class TaskRepository implements ITaskRepository {
  public readonly database: Database;

  constructor(db: Database) {
    this.database = db;
  }

  insert(task: Task): void {
    const stmt = this.database.prepare(`
      INSERT INTO tasks (id, status, prompt, priority, fromAgentId, fromAgentName, toAgentId, toAgentRole, 
        assignedTo, context, response, messages, history, createdAt, completedAt, spec, workspace)
      VALUES (@id, @status, @prompt, @priority, @fromAgentId, @fromAgentName, @toAgentId, @toAgentRole,
        @assignedTo, @context, @response, @messages, @history, @createdAt, @completedAt, @spec, @workspace)
    `);
    stmt.run({
      id: task.id,
      status: task.status || 'QUEUED',
      prompt: task.prompt,
      priority: task.priority || 'normal',
      fromAgentId: task.from?.id || null,
      fromAgentName: task.from?.name || null,
      toAgentId: task.to?.id || null,
      toAgentRole: task.to?.role || null,
      assignedTo: task.assignedTo || null,
      context: task.context ? JSON.stringify(task.context) : null,
      response: task.response ? JSON.stringify(task.response) : null,
      messages: task.messages ? JSON.stringify(task.messages) : '[]',
      history: task.history ? JSON.stringify(task.history) : '[]',
      createdAt: task.createdAt || Date.now(),
      completedAt: task.completedAt || null,
      spec: task.spec || null,
      workspace: task.workspace || null
    });
  }

  update(task: Task): void {
    const stmt = this.database.prepare(`
      UPDATE tasks SET 
        status = @status, 
        assignedTo = @assignedTo,
        context = @context, 
        response = @response, 
        messages = @messages, 
        history = @history,
        completedAt = @completedAt,
        spec = @spec,
        workspace = @workspace
      WHERE id = @id
    `);
    stmt.run({
      id: task.id,
      status: task.status,
      assignedTo: task.assignedTo || null,
      context: task.context ? JSON.stringify(task.context) : null,
      response: task.response ? JSON.stringify(task.response) : null,
      messages: task.messages ? JSON.stringify(task.messages) : '[]',
      history: task.history ? JSON.stringify(task.history) : '[]',
      completedAt: task.completedAt || null,
      spec: task.spec || null,
      workspace: task.workspace || null
    });
  }

  updateStatus(taskId: string, status: TaskStatus): void {
    const completedAt = TERMINAL_STATUSES.includes(status) ? Date.now() : null;
    this.database.prepare('UPDATE tasks SET status = ?, completedAt = ? WHERE id = ?')
      .run(status, completedAt, taskId);
  }

  getById(taskId: string): Task | null {
    const row = this.database.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
    return row ? this.mapRowToTask(row) : null;
  }

  getActive(): Task[] {
    const rows = this.database.prepare(
      `SELECT * FROM tasks WHERE status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})`
    ).all(...TERMINAL_STATUSES) as any[];
    return rows.map(r => this.mapRowToTask(r));
  }

  getByStatus(status: TaskStatus): Task[] {
    const rows = this.database.prepare('SELECT * FROM tasks WHERE status = ?').all(status) as any[];
    return rows.map(r => this.mapRowToTask(r));
  }

  getByStatuses(statuses: TaskStatus[]): Task[] {
    const placeholders = statuses.map(() => '?').join(', ');
    const rows = this.database.prepare(`SELECT * FROM tasks WHERE status IN (${placeholders})`).all(...statuses) as any[];
    return rows.map(r => this.mapRowToTask(r));
  }

  getByAssignedTo(agentId: string): Task[] {
    const rows = this.database.prepare('SELECT * FROM tasks WHERE assignedTo = ?').all(agentId) as any[];
    return rows.map(r => this.mapRowToTask(r));
  }

  getHistory(options: { status?: TaskStatus; limit?: number; offset?: number; agentId?: string }): Task[] {
    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }
    if (options.agentId) {
      query += ' AND assignedTo = ?';
      params.push(options.agentId);
    }

    query += ' ORDER BY createdAt DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.database.prepare(query).all(...params) as any[];
    return rows.map(r => this.mapRowToTask(r));
  }

  getStats(): { total: number; byStatus: Record<string, number> } {
    const total = (this.database.prepare('SELECT COUNT(*) as count FROM tasks').get() as any).count;
    const byStatusRows = this.database.prepare('SELECT status, COUNT(*) as count FROM tasks GROUP BY status').all() as any[];
    const byStatus: Record<string, number> = {};
    for (const row of byStatusRows) {
      byStatus[row.status] = row.count;
    }
    return { total, byStatus };
  }

  addMessage(taskId: string, role: string, content: string, metadata?: Record<string, any>): void {
    const task = this.getById(taskId);
    if (!task) return;

    const messages = task.messages || [];
    messages.push({ role, content, timestamp: Date.now(), metadata });

    this.database.prepare('UPDATE tasks SET messages = ? WHERE id = ?')
      .run(JSON.stringify(messages), taskId);
  }

  getMessages(taskId: string): Array<{ role: string; content: string; timestamp: number; metadata?: Record<string, any> }> {
    const task = this.getById(taskId);
    return task?.messages || [];
  }

  clearAll(): void {
    this.database.prepare('DELETE FROM tasks').run();
  }

  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      command: 'execute_prompt', // Default command
      prompt: row.prompt,
      status: row.status as TaskStatus,
      priority: row.priority || 'normal',
      from: row.fromAgentId ? { type: 'agent', id: row.fromAgentId, name: row.fromAgentName } : { type: 'user', id: 'system', name: 'System' },
      to: { role: row.toAgentRole || undefined, id: row.toAgentId || undefined, agentId: row.toAgentId || row.assignedTo || undefined },
      assignedTo: row.assignedTo,
      context: row.context ? JSON.parse(row.context) : undefined,
      response: row.response ? JSON.parse(row.response) : undefined,
      messages: row.messages ? JSON.parse(row.messages) : [],
      history: row.history ? JSON.parse(row.history) : [],
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      spec: row.spec,
      workspace: row.workspace
    } as Task;
  }
}
