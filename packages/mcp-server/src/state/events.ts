import { EventEmitter } from 'events';
import type { Database } from 'better-sqlite3';
import type { Task } from '@opensourcewtf/waaah-types';

/**
 * Event bus for real-time notifications (delegation, task completion, etc.)
 */
export const eventBus = new EventEmitter();

// Database instance for persistence (set via initEventLog)
let eventDb: Database | null = null;

/**
 * Initialize the event log with a database instance.
 * MUST be called before using emitActivity in production.
 * Tests can skip this to avoid DB persistence.
 */
export function initEventLog(db: Database): void {
  eventDb = db;
}

// Event types
export interface DelegationEvent {
  taskId: string;
  from: string;
  to: string;
  prompt: string;
  priority: string;
  createdAt: number;
}

export interface ActivityEvent {
  type: 'activity';
  category: 'AGENT' | 'TASK' | 'SYSTEM';
  message: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Emits a 'delegation' event to notify listeners (e.g., SSE streams) of a new task delegation.
 * 
 * @param event - The delegation event details.
 */
export const emitDelegation = (event: DelegationEvent) => {
  eventBus.emit('delegation', event);
};

export const emitActivity = (category: ActivityEvent['category'], message: string, metadata?: Record<string, unknown>) => {
  const timestamp = Date.now();

  // Persist to DB only if initialized
  if (eventDb) {
    try {
      eventDb.prepare('INSERT INTO logs (timestamp, category, message, metadata) VALUES (?, ?, ?, ?)').run(
        timestamp,
        category,
        message,
        metadata ? JSON.stringify(metadata) : null
      );
    } catch (e) {
      console.error('Failed to persist log:', e);
    }
  }

  eventBus.emit('activity', {
    type: 'activity',
    category,
    message,
    timestamp,
    metadata
  });
};

/**
 * Emits a 'task:created' event to notify listeners (e.g., SSE streams).
 * 
 * @param task - The task object.
 */
export const emitTaskCreatedEvent = (task: Task) => {
  eventBus.emit('task:created', task);
};
