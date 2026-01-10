
import type { Database } from 'better-sqlite3';
import { StandardCapability } from '@opensourcewtf/waaah-types';

/**
 * Manages direct database access for queue state.
 * Handles pending ACKs and waiting agents.
 */
export class QueueDbState {
  constructor(private readonly db: Database) {}

  /**
   * Get pending ACKs from database.
   */
  getPendingAcks(): Map<string, { taskId: string; agentId: string; sentAt: number }> {
    const rows = this.db.prepare(
      'SELECT id, pendingAckAgentId, ackSentAt FROM tasks WHERE status = ? AND pendingAckAgentId IS NOT NULL'
    ).all('PENDING_ACK') as any[];

    const map = new Map<string, { taskId: string; agentId: string; sentAt: number }>();
    for (const row of rows) {
      map.set(row.id, {
        taskId: row.id,
        agentId: row.pendingAckAgentId,
        sentAt: row.ackSentAt
      });
    }
    return map;
  }

  /**
   * Get waiting agents from database.
   * Returns agent ID -> capabilities mapping.
   */
  getWaitingAgents(): Map<string, StandardCapability[]> {
    const rows = this.db.prepare(
      'SELECT id, capabilities FROM agents WHERE waitingSince IS NOT NULL'
    ).all() as any[];

    const map = new Map<string, StandardCapability[]>();
    for (const row of rows) {
      const caps = row.capabilities ? JSON.parse(row.capabilities) : [];
      map.set(row.id, caps);
    }
    return map;
  }

  /**
   * Set pending ACK state in database.
   */
  setPendingAck(taskId: string, agentId: string): void {
    this.db.prepare(
      'UPDATE tasks SET pendingAckAgentId = ?, ackSentAt = ? WHERE id = ?'
    ).run(agentId, Date.now(), taskId);
  }

  /**
   * Clear pending ACK state in database.
   */
  clearPendingAck(taskId: string): void {
    this.db.prepare(
      'UPDATE tasks SET pendingAckAgentId = NULL, ackSentAt = NULL WHERE id = ?'
    ).run(taskId);
  }

  /**
   * Set agent waiting state in database.
   * Creates the agent row if it doesn't exist (for tests and edge cases).
   */
  setAgentWaiting(agentId: string, capabilities: StandardCapability[]): void {
    try {
      // Ensure agent exists (upsert pattern)
      this.db.prepare(
        'INSERT OR IGNORE INTO agents (id, displayName, capabilities) VALUES (?, ?, ?)'
      ).run(agentId, agentId, JSON.stringify(capabilities));

      this.db.prepare(
        'UPDATE agents SET waitingSince = ?, capabilities = ? WHERE id = ?'
      ).run(Date.now(), JSON.stringify(capabilities), agentId);
    } catch (e: any) {
      console.error(`[QueueDbState] Failed to set agent waiting: ${e.message}`);
    }
  }

  /**
   * Clear agent waiting state in database.
   */
  clearAgentWaiting(agentId: string): void {
    try {
      this.db.prepare(
        'UPDATE agents SET waitingSince = NULL WHERE id = ?'
      ).run(agentId);
    } catch (e: any) {
      console.error(`[QueueDbState] Failed to clear agent waiting: ${e.message}`);
    }
  }

  /**
   * Check if a specific agent is currently waiting.
   */
  isAgentWaiting(agentId: string): boolean {
    const row = this.db.prepare('SELECT waitingSince FROM agents WHERE id = ?').get(agentId) as any;
    return row?.waitingSince != null;
  }

  /**
   * Get agent's last seen timestamp from database.
   */
  getAgentLastSeen(agentId: string): number | undefined {
    try {
      const row = this.db.prepare('SELECT lastSeen FROM agents WHERE id = ?').get(agentId) as any;
      return row?.lastSeen;
    } catch {
      return undefined;
    }
  }

  /**
   * Clear all waiting agents.
   */
  clearAllWaitingAgents(): void {
    this.db.prepare('UPDATE agents SET waitingSince = NULL').run();
  }
}
