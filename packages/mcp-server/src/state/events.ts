import { EventEmitter } from 'events';
import { db } from './db.js';

/**
 * Event bus for real-time notifications (delegation, task completion, etc.)
 */
export const eventBus = new EventEmitter();

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
  metadata?: Record<string, any>;
}

/**
 * Emits a 'delegation' event to notify listeners (e.g., SSE streams) of a new task delegation.
 * 
 * @param event - The delegation event details.
 */
export const emitDelegation = (event: DelegationEvent) => {
  eventBus.emit('delegation', event);
};

export const emitActivity = (category: ActivityEvent['category'], message: string, metadata?: Record<string, any>) => {
  const timestamp = Date.now();

  // Persist to DB
  try {
    db.prepare('INSERT INTO logs (timestamp, category, message, metadata) VALUES (?, ?, ?, ?)').run(
      timestamp,
      category,
      message,
      metadata ? JSON.stringify(metadata) : null
    );
  } catch (e) {
    console.error('Failed to persist log:', e);
  }

  eventBus.emit('activity', {
    type: 'activity',
    category,
    message,
    timestamp,
    metadata
  });
};
