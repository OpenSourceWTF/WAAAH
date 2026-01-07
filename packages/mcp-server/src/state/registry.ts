import {
  AgentIdentity,
  AgentRole
} from '@waaah/types';
import { db } from './db.js';

export class AgentRegistry {
  // We no longer need memory cache as source of truth, but could cache for perf.
  // For now, let's read directly from DB for simplicity and consistency.

  register(agent: { id: string; role: AgentRole; displayName: string; capabilities: string[] }): string {
    let finalId = agent.id;

    // Check for collision with an ACTIVE agent
    // We define "active" as seen within the last 5 minutes.
    // If inactive, we allow overwrite (reclaim).
    const existing = this.get(agent.id);
    if (existing && existing.lastSeen) {
      const timeSinceLastSeen = Date.now() - existing.lastSeen;
      const IS_ACTIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

      if (timeSinceLastSeen < IS_ACTIVE_THRESHOLD) {
        // Collision with active agent! Rename the new one.
        const randomSuffix = Math.random().toString(36).substring(2, 6);
        finalId = `${agent.id}-${randomSuffix}`;
        console.log(`[Registry] ID Collision: '${agent.id}' is active. Renaming new agent to '${finalId}'`);
      }
    }

    // Upsert agent with finalId
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
        id: finalId,
        role: agent.role,
        displayName: agent.displayName,
        lastSeen: Date.now(),
        capabilities: JSON.stringify(agent.capabilities || [])
      });

      // Also ensure aliases exist for this agent ID (like its displayName)
      // We don't want to clobber existing aliases, just ensure the basic ones exist.
      // But aliases are complex. Let's keep it simple: DB seeding handles the main ones.

      console.log(`[Registry] Registered agent: ${finalId}`);
      return finalId;
    } catch (e: any) {
      console.error(`[Registry] Registration failed: ${e.message}`);
      // Fallback: return original ID if insertion fails, though it likely failed due to DB error
      return finalId;
    }
  }

  get(agentId: string): (AgentIdentity & { id: string; color?: string; lastSeen?: number }) | undefined {
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (!row) return undefined;
    return this.mapRowToIdentity(row);
  }

  getByDisplayName(displayName: string): (AgentIdentity & { id: string; color?: string; lastSeen?: number }) | undefined {
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

  getByRole(role: string): (AgentIdentity & { id: string; color?: string; lastSeen?: number }) | undefined {
    // Pick the most recently seen agent with this role
    const row = db.prepare('SELECT * FROM agents WHERE role = ? ORDER BY lastSeen DESC LIMIT 1').get(role) as any;
    if (!row) return undefined;
    return this.mapRowToIdentity(row);
  }

  getAll(): (AgentIdentity & { id: string; color?: string; lastSeen?: number })[] {
    const rows = db.prepare('SELECT * FROM agents').all() as any[];
    return rows.map(r => this.mapRowToIdentity(r));
  }

  getAllowedDelegates(role: AgentRole): string[] {
    // 1. Try to get from DB first
    let dbDelegates: string[] = [];
    const row = db.prepare('SELECT canDelegateTo FROM agents WHERE role = ? LIMIT 1').get(role) as any;

    if (row && row.canDelegateTo) {
      try {
        dbDelegates = JSON.parse(row.canDelegateTo);
      } catch (e) { dbDelegates = []; }
    }

    // 2. Define Hardcoded Defaults (The "Constitution")
    const defaults: Record<string, string[]> = {
      'boss': ['project-manager', 'full-stack-engineer', 'test-engineer', 'ops-engineer', 'designer', 'developer', 'code-monk'],
      'project-manager': ['full-stack-engineer', 'test-engineer', 'designer', 'ops-engineer'],
      'full-stack-engineer': ['project-manager', 'test-engineer', 'ops-engineer'],
      'test-engineer': ['full-stack-engineer', 'ops-engineer'], // Report bugs back
      'ops-engineer': ['full-stack-engineer'] // Escalate issues
    };

    // 3. Merge: If DB has specific rules, use them? Or Union?
    // Let's Union them to be safe, ensuring code-defaults always work.
    const defaultDelegates = defaults[role] || [];

    // Unique merge
    return Array.from(new Set([...dbDelegates, ...defaultDelegates]));
  }

  canDelegate(sourceRole: AgentRole, targetRole: AgentRole): boolean {
    const allowed = this.getAllowedDelegates(sourceRole);
    return allowed.includes(targetRole);
  }

  heartbeat(agentId: string): void {
    db.prepare('UPDATE agents SET lastSeen = ? WHERE id = ?').run(Date.now(), agentId);
  }

  cleanup(timeoutMs: number = 5 * 60 * 1000, excludeAgentIds: string[] = []): number {
    const cutoff = Date.now() - timeoutMs;
    try {
      // Clean up agents that are stale OR have never connected (NULL lastSeen)
      // BUT preserve seeded role configurations (those with canDelegateTo set)
      let query = `
        DELETE FROM agents 
        WHERE (lastSeen < ? OR lastSeen IS NULL) 
        AND (canDelegateTo IS NULL OR canDelegateTo = '[]')
      `;

      const params: any[] = [cutoff];

      if (excludeAgentIds.length > 0) {
        // Exclude specific agents from cleanup
        const placeholders = excludeAgentIds.map(() => '?').join(',');
        query += ` AND id NOT IN (${placeholders})`;
        params.push(...excludeAgentIds);
      }

      const result = db.prepare(query).run(...params);
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

  private mapRowToIdentity(row: any): AgentIdentity & { id: string; color?: string; lastSeen?: number } {
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
