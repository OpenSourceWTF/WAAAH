import {
  AgentIdentity,
  AgentRole
} from '@waaah/types';
import { db } from './db.js';

export class AgentRegistry {
  // We no longer need memory cache as source of truth, but could cache for perf.
  // For now, let's read directly from DB for simplicity and consistency.

  register(agent: AgentIdentity): void {
    // Upsert agent
    const stmt = db.prepare(`
      INSERT INTO agents (id, role, displayName, lastSeen, capabilities)
      VALUES (@id, @role, @displayName, @lastSeen, @capabilities)
      ON CONFLICT(id) DO UPDATE SET
        lastSeen = @lastSeen,
        capabilities = @capabilities
        -- Note: We generally don't overwrite displayName or role on re-register 
        -- to preserve user renames, unless explicit logic is added.
        -- But capabilities/heartbeat should update.
    `);

    // Check if we need to preserve an existing manual rename?
    // The requirement says "renaming the agent's human readable name mapping to internal agent id".
    // If an admin renamed it, we shouldn't overwrite it with the agent's default claim on restart.
    // The ON CONFLICT clause above *preserves* displayName because I didn't add it to the DO UPDATE SET list.
    // However, if it's a NEW agent (first time seen), it inserts the default. This is perfect.

    try {
      stmt.run({
        id: agent.id,
        role: agent.role,
        displayName: agent.displayName,
        lastSeen: Date.now(),
        capabilities: JSON.stringify(agent.capabilities || [])
      });

      // Also ensure aliases exist for this agent ID (like its displayName)
      // We don't want to clobber existing aliases, just ensure the basic ones exist.
      // But aliases are complex. Let's keep it simple: DB seeding handles the main ones.

      console.log(`[Registry] Registered agent: ${agent.id}`);
    } catch (e: any) {
      console.error(`[Registry] Registration failed: ${e.message}`);
    }
  }

  get(agentId: string): AgentIdentity | undefined {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (!row) return undefined;
    return this.mapRowToIdentity(row);
  }

  getByDisplayName(displayName: string): AgentIdentity | undefined {
    const lowerName = displayName.toLowerCase();

    // 1. Direct match on displayName
    let row = db.prepare('SELECT * FROM agents WHERE lower(displayName) = ?').get(lowerName) as any;

    // 2. Alias lookup
    if (!row) {
      const aliasRow = db.prepare('SELECT agentId FROM aliases WHERE alias = ?').get(lowerName) as any;
      if (aliasRow) {
        row = db.prepare('SELECT * FROM agents WHERE id = ?').get(aliasRow.agentId) as any;
      }
    }

    if (!row) return undefined;

    // Check if alive? implementation_plan/task doesn't strictly say we filter by liveness for retrieval,
    // but assignment usually requires liveness. Let's return the identity regardless, caller checks liveness.
    return this.mapRowToIdentity(row);
  }

  getAll(): AgentIdentity[] {
    const rows = db.prepare('SELECT * FROM agents').all() as any[];
    return rows.map(r => this.mapRowToIdentity(r));
  }

  getAllowedDelegates(role: AgentRole): string[] {
    // This is stored in JSON in the agent row if seeded, or potentially global config?
    // In our seeding logic, we put it in the `canDelegateTo` column on the AGENT row.
    // But permissions are technically ROLE based.
    // Let's grab ANY agent with this role and check their permissions (or the first one).
    // Or, we should have a `roles` table. 
    // Given the current schema in db.ts: `canDelegateTo TEXT` is on the `agents` table.

    const row = db.prepare('SELECT canDelegateTo FROM agents WHERE role = ? LIMIT 1').get(role) as any;
    if (row && row.canDelegateTo) {
      try {
        return JSON.parse(row.canDelegateTo);
      } catch (e) { return []; }
    }
    return [];
  }

  canDelegate(sourceRole: AgentRole, targetRole: AgentRole): boolean {
    const allowed = this.getAllowedDelegates(sourceRole);
    return allowed.includes(targetRole);
  }

  heartbeat(agentId: string): void {
    db.prepare('UPDATE agents SET lastSeen = ? WHERE id = ?').run(Date.now(), agentId);
  }

  cleanup(timeoutMs: number = 5 * 60 * 1000): number {
    const cutoff = Date.now() - timeoutMs;
    try {
      const result = db.prepare('DELETE FROM agents WHERE lastSeen < ?').run(cutoff);
      if (result.changes > 0) {
        console.log(`[Registry] Cleaned up ${result.changes} offline agent(s)`);
      }
      return result.changes;
    } catch (e: any) {
      console.error(`[Registry] Cleanup failed: ${e.message}`);
      return 0;
    }
  }

  updateAgent(agentId: string, updates: { displayName?: string, color?: string }): boolean {
    const fields = [];
    const values: any = { id: agentId };

    if (updates.displayName) {
      fields.push('displayName = @displayName');
      values.displayName = updates.displayName;
    }
    if (updates.color) {
      fields.push('color = @color');
      values.color = updates.color;
    }

    if (fields.length === 0) return false;

    const sql = `UPDATE agents SET ${fields.join(', ')} WHERE id = @id`;
    const result = db.prepare(sql).run(values);

    if (result.changes > 0 && updates.displayName) {
      // Also add the new name as an alias automatically
      try {
        db.prepare('INSERT OR IGNORE INTO aliases (alias, agentId) VALUES (?, ?)').run(updates.displayName.toLowerCase(), agentId);
      } catch (e) { }
    }

    return result.changes > 0;
  }

  private mapRowToIdentity(row: any): AgentIdentity & { color?: string; lastSeen?: number } {
    return {
      id: row.id,
      role: row.role as AgentRole,
      displayName: row.displayName,
      capabilities: JSON.parse(row.capabilities || '[]'),
      // Add extra props that might not be in the strict AgentIdentity type yet
      color: row.color,
      lastSeen: row.lastSeen
    };
  }

  // Helper to get color
  getAgentColor(agentId: string): string | undefined {
    const row = db.prepare('SELECT color FROM agents WHERE id = ?').get(agentId) as any;
    return row?.color;
  }

  // Helper to get lastSeen timestamp
  getLastSeen(agentId: string): number | undefined {
    const row = db.prepare('SELECT lastSeen FROM agents WHERE id = ?').get(agentId) as any;
    return row?.lastSeen;
  }
}
