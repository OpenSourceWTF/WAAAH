import type { Database } from 'better-sqlite3';
import { StandardCapability, WorkspaceContext } from '@opensourcewtf/waaah-types';

/**
 * Handles direct database operations for queue state (pending ACKs, waiting agents).
 */
export class QueuePersistence {
  constructor(private readonly db: Database) { }

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
   * Returns agent ID -> details mapping.
   */
  getWaitingAgents(): Map<string, { capabilities: StandardCapability[]; workspaceContext?: WorkspaceContext }> {
    const rows = this.db.prepare(
      'SELECT id, capabilities, workspaceContext FROM agents WHERE waitingSince IS NOT NULL'
    ).all() as any[];

    const map = new Map<string, { capabilities: StandardCapability[]; workspaceContext?: WorkspaceContext }>();
    for (const row of rows) {
      const caps = row.capabilities ? JSON.parse(row.capabilities) : [];
      let workspaceContext;
      try {
        if (row.workspaceContext) {
          workspaceContext = JSON.parse(row.workspaceContext);
        }
      } catch (e) {
        // Ignore invalid JSON
      }
      map.set(row.id, { capabilities: caps, workspaceContext });
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
   * Get pending ACK for a specific task.
   */
  getPendingAck(taskId: string): { agentId: string; sentAt: number } | null {
    const row = this.db.prepare(
      'SELECT pendingAckAgentId, ackSentAt FROM tasks WHERE id = ?'
    ).get(taskId) as any;
    if (row && row.pendingAckAgentId) {
      return { agentId: row.pendingAckAgentId, sentAt: row.ackSentAt };
    }
    return null;
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
  setAgentWaiting(
    agentId: string,
    capabilities: StandardCapability[],
    workspaceContext?: WorkspaceContext
  ): void {
    try {
      // Ensure agent exists (upsert pattern)
      this.db.prepare(
        'INSERT OR IGNORE INTO agents (id, displayName, capabilities, workspaceContext) VALUES (?, ?, ?, ?)'
      ).run(agentId, agentId, JSON.stringify(capabilities), workspaceContext ? JSON.stringify(workspaceContext) : null);

      // Only update mutable fields
      const updates = ['waitingSince = ?, capabilities = ?'];
      const params: any[] = [Date.now(), JSON.stringify(capabilities)];

      if (workspaceContext) {
        updates.push('workspaceContext = ?');
        params.push(JSON.stringify(workspaceContext));
      }

      params.push(agentId);

      this.db.prepare(
        `UPDATE agents SET ${updates.join(', ')} WHERE id = ?`
      ).run(...params);
    } catch (e: any) {
      console.error(`[QueuePersistence] Failed to set agent waiting: ${e.message}`);
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
      console.error(`[QueuePersistence] Failed to clear agent waiting: ${e.message}`);
    }
  }

  /**
   * Check if a specific agent is currently waiting (from DB)
   */
  isAgentWaiting(agentId: string): boolean {
    const row = this.db.prepare('SELECT waitingSince FROM agents WHERE id = ?').get(agentId) as any;
    return row?.waitingSince != null;
  }

  /**
   * Clear all waiting agents (connections are gone after restart)
   */
  clearAllWaitingAgents(): void {
    this.db.prepare('UPDATE agents SET waitingSince = NULL WHERE waitingSince IS NOT NULL').run();
  }

  /**
   * Clear all waiting agents (unconditionally)
   */
  resetWaitingAgents(): void {
    this.db.prepare('UPDATE agents SET waitingSince = NULL').run();
  }
}
