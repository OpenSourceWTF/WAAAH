/**
 * EvictionService - Agent eviction management
 * 
 * Handles queuing and consuming eviction signals for agents.
 * Evictions are stored in the database for reliability.
 * 
 * Extracted from queue.ts for single-responsibility principle.
 */
import type { Database } from 'better-sqlite3';
import type { EventEmitter } from 'events';

export type EvictionAction = 'RESTART' | 'SHUTDOWN';

export interface EvictionSignal {
  reason: string;
  action: EvictionAction;
}

/**
 * Interface for eviction service to allow mocking in tests.
 */
export interface IEvictionService {
  queueEviction(agentId: string, reason: string, action: EvictionAction): void;
  popEviction(agentId: string): EvictionSignal | null;
}

/**
 * Manages agent eviction signals using database-backed state.
 */
export class EvictionService implements IEvictionService {
  constructor(
    private readonly db: Database,
    private readonly emitter?: EventEmitter
  ) { }

  /**
   * Queues an eviction for an agent.
   * 
   * @param agentId - The agent to evict
   * @param reason - Human-readable reason for eviction
   * @param action - Either 'RESTART' (graceful) or 'SHUTDOWN' (immediate)
   */
  queueEviction(agentId: string, reason: string, action: EvictionAction): void {
    // Check existing eviction - don't downgrade SHUTDOWN to RESTART
    const existing = this.db.prepare(
      'SELECT eviction_action FROM agents WHERE id = ? AND eviction_requested = 1'
    ).get(agentId) as { eviction_action?: string } | undefined;

    if (existing?.eviction_action === 'SHUTDOWN' && action === 'RESTART') {
      return;
    }

    this.db.prepare(
      'UPDATE agents SET eviction_requested = 1, eviction_reason = ?, eviction_action = ? WHERE id = ?'
    ).run(reason, action, agentId);

    console.log(`[Eviction] Queued eviction for ${agentId}: ${action} (${reason})`);
    this.emitter?.emit('eviction', agentId);
  }

  /**
   * Checks for and consumes a pending eviction signal.
   * 
   * @param agentId - The agent to check
   * @returns The eviction signal if one exists, null otherwise
   */
  popEviction(agentId: string): EvictionSignal | null {
    const row = this.db.prepare(
      'SELECT eviction_reason, eviction_action FROM agents WHERE id = ? AND eviction_requested = 1'
    ).get(agentId) as { eviction_reason?: string; eviction_action?: string } | undefined;

    if (row) {
      // Clear the eviction
      this.db.prepare(
        'UPDATE agents SET eviction_requested = 0, eviction_reason = NULL, eviction_action = NULL WHERE id = ?'
      ).run(agentId);

      return {
        reason: row.eviction_reason || 'Unknown reason',
        action: (row.eviction_action || 'RESTART') as EvictionAction
      };
    }
    return null;
  }
}
