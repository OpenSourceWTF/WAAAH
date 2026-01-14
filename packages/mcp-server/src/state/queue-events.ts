import { EventEmitter } from 'events';
import type { Task } from '@opensourcewtf/waaah-types';

/**
 * Event types emitted by TaskQueue
 */
export interface TaskQueueEvents {
  /** Emitted when a task is assigned to an agent */
  task: [task: Task, agentId: string];
  /** Emitted when a task is completed */
  completion: [task: Task];
  /** Emitted when an eviction is queued for an agent */
  eviction: [agentId: string];
  /** Emitted when a system prompt is queued for an agent */
  system_prompt: [agentId: string];
}

/**
 * Type-safe event emitter for TaskQueue events.
 * Extends Node.js EventEmitter with TypeScript type safety.
 */
export class TypedEventEmitter extends EventEmitter {
  emit<K extends keyof TaskQueueEvents>(event: K, ...args: TaskQueueEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof TaskQueueEvents>(event: K, listener: (...args: TaskQueueEvents[K]) => void): this {
    // Cast required for Node.js EventEmitter compatibility
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof TaskQueueEvents>(event: K, listener: (...args: TaskQueueEvents[K]) => void): this {
    // Cast required for Node.js EventEmitter compatibility
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof TaskQueueEvents>(event: K, listener: (...args: TaskQueueEvents[K]) => void): this {
    // Cast required for Node.js EventEmitter compatibility
    return super.off(event, listener as (...args: unknown[]) => void);
  }
}
