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
  addMessage(taskId: string, role: string, content: string, metadata?: Record<string, any>, isRead?: boolean, replyTo?: string): void;
  /** Get messages for a task */
  getMessages(taskId: string): Array<{ role: string; content: string; timestamp: number; isRead?: boolean; metadata?: Record<string, any> }>;
  /** Get unread user comments for a task */
  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, any> }>;
  /** Mark all unread comments as read */
  markCommentsAsRead(taskId: string): number;
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
      INSERT INTO tasks (id, status, prompt, title, priority, fromAgentId, fromAgentName, toAgentId, toRequiredCapabilities, toWorkspaceId,
        assignedTo, context, response, dependencies, history, createdAt, completedAt)
      VALUES (@id, @status, @prompt, @title, @priority, @fromAgentId, @fromAgentName, @toAgentId, @toRequiredCapabilities, @toWorkspaceId,
        @assignedTo, @context, @response, @dependencies, @history, @createdAt, @completedAt)
    `);
    stmt.run({
      id: task.id,
      status: task.status || 'QUEUED',
      prompt: task.prompt,
      title: task.title || null,
      priority: task.priority || 'normal',
      fromAgentId: task.from?.id || null,
      fromAgentName: task.from?.name || null,
      toAgentId: task.to?.agentId || null,
      toRequiredCapabilities: task.to?.requiredCapabilities ? JSON.stringify(task.to.requiredCapabilities) : null,
      toWorkspaceId: task.to?.workspaceId || null,
      assignedTo: task.assignedTo || null,
      context: task.context ? JSON.stringify(task.context) : null,
      response: task.response ? JSON.stringify(task.response) : null,
      dependencies: task.dependencies ? JSON.stringify(task.dependencies) : '[]',
      history: task.history ? JSON.stringify(task.history) : '[]',
      createdAt: task.createdAt || Date.now(),
      completedAt: task.completedAt || null
    });
  }

  update(task: Task): void {
    const stmt = this.database.prepare(`
      UPDATE tasks SET 
        status = @status, 
        title = @title,
        assignedTo = @assignedTo,
        context = @context, 
        response = @response, 
        dependencies = @dependencies, 
        history = @history,
        completedAt = @completedAt
      WHERE id = @id
    `);
    stmt.run({
      id: task.id,
      status: task.status,
      title: task.title || null,
      assignedTo: task.assignedTo || null,
      context: task.context ? JSON.stringify(task.context) : null,
      response: task.response ? JSON.stringify(task.response) : null,
      dependencies: task.dependencies ? JSON.stringify(task.dependencies) : '[]',
      history: task.history ? JSON.stringify(task.history) : '[]',
      completedAt: task.completedAt || null
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

  addMessage(taskId: string, role: string, content: string, metadata?: Record<string, any>, isRead: boolean = true, replyTo?: string): void {
    const task = this.getById(taskId);
    if (!task) return;

    const messages = task.messages || [];
    messages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      taskId,
      role: role as 'user' | 'agent' | 'system',
      content,
      timestamp: Date.now(),
      isRead, // User comments start as unread (false), agent/system as read (true)
      replyTo, // For threading: references parent message ID
      metadata
    });

    this.database.prepare('UPDATE tasks SET messages = ? WHERE id = ?')
      .run(JSON.stringify(messages), taskId);
  }

  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, any> }> {
    const task = this.getById(taskId);
    if (!task || !task.messages) return [];

    // Only return unread user comments (not review_feedback or other types)
    return task.messages
      .filter(m => m.role === 'user' && m.isRead === false && m.messageType === 'comment')
      .map(m => ({ id: m.id, content: m.content, timestamp: m.timestamp, metadata: m.metadata }));
  }

  markCommentsAsRead(taskId: string): number {
    const task = this.getById(taskId);
    if (!task || !task.messages) return 0;

    let count = 0;
    const updatedMessages = task.messages.map(m => {
      if (m.role === 'user' && m.isRead === false && m.messageType === 'comment') {
        count++;
        return { ...m, isRead: true };
      }
      return m;
    });

    if (count > 0) {
      this.database.prepare('UPDATE tasks SET messages = ? WHERE id = ?')
        .run(JSON.stringify(updatedMessages), taskId);
    }

    return count;
  }

  getMessages(taskId: string): Array<{ role: string; content: string; timestamp: number; isRead?: boolean; metadata?: Record<string, any> }> {
    const task = this.getById(taskId);
    return task?.messages || [];
  }

  clearAll(): void {
    this.database.prepare('DELETE FROM tasks').run();
  }

  private mapRowToTask(row: any): Task {
    let requiredCapabilities = undefined;
    if (row.toRequiredCapabilities) {
      try {
        requiredCapabilities = JSON.parse(row.toRequiredCapabilities);
      } catch { /* ignore */ }
    }
    return {
      id: row.id,
      command: 'execute_prompt', // Default command
      prompt: row.prompt,
      title: row.title,
      status: row.status as TaskStatus,
      priority: row.priority || 'normal',
      from: row.fromAgentId ? { type: 'agent', id: row.fromAgentId, name: row.fromAgentName } : { type: 'user', id: 'system', name: 'System' },
      to: {
        agentId: row.toAgentId || row.assignedTo || undefined,
        requiredCapabilities,
        workspaceId: row.toWorkspaceId || undefined
      },
      assignedTo: row.assignedTo,
      context: row.context ? JSON.parse(row.context) : undefined,
      response: row.response ? JSON.parse(row.response) : undefined,
      messages: row.messages ? JSON.parse(row.messages) : [],
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
      history: row.history ? JSON.parse(row.history) : [],
      createdAt: row.createdAt,
      completedAt: row.completedAt
    };
  }
}

