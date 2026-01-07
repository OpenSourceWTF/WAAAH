import { EventEmitter } from 'events';

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

export const emitDelegation = (event: DelegationEvent) => {
  eventBus.emit('delegation', event);
};
