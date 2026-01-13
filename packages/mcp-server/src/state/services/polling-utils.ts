/**
 * Polling Utilities
 *
 * Shared utilities for long-polling implementations.
 * Eliminates code duplication between agent-matcher and polling-service.
 *
 * @module state/services/polling-utils
 */

import type { Task } from '@opensourcewtf/waaah-types';
import type { TypedEventEmitter } from '../queue-events.js';

/**
 * Result type for wait operations - either a task, eviction signal, or timeout (null).
 */
export type WaitResult = Task | { controlSignal: 'EVICT'; reason: string; action: 'RESTART' | 'SHUTDOWN' } | null;

/**
 * Options for creating a polling promise.
 */
export interface PollingPromiseOptions {
  agentId: string;
  emitter: TypedEventEmitter;
  timeoutMs: number;
  popEviction: (agentId: string) => { reason: string; action: 'RESTART' | 'SHUTDOWN' } | null;
  onCleanup: () => void;
}

/**
 * Creates a polling promise that listens for task or eviction events.
 * Shared implementation used by both agent-matcher and PollingService.
 *
 * @param options - Configuration for the polling promise
 * @returns Promise that resolves with task, eviction signal, or null on timeout
 */
export function createPollingPromise(options: PollingPromiseOptions): Promise<WaitResult> {
  const { agentId, emitter, timeoutMs, popEviction, onCleanup } = options;

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutTimer: NodeJS.Timeout;

    const finish = (result: WaitResult) => {
      if (resolved) return;
      resolved = true;

      emitter.off('task', onTask);
      emitter.off('eviction', onEviction);
      if (timeoutTimer) clearTimeout(timeoutTimer);

      onCleanup();
      resolve(result);
    };

    const onTask = (task: Task, intendedAgentId?: string) => {
      if (intendedAgentId === agentId) {
        finish(task);
      }
    };

    const onEviction = (targetId: string) => {
      if (targetId === agentId) {
        const ev = popEviction(agentId);
        if (ev) finish({ controlSignal: 'EVICT', ...ev });
      }
    };

    emitter.on('task', onTask);
    emitter.on('eviction', onEviction);

    timeoutTimer = setTimeout(() => {
      finish(null);
    }, timeoutMs);
  });
}
