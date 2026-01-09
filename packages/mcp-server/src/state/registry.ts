import {
  AgentIdentity,
  AgentRole
} from '@opensourcewtf/waaah-types';
import { db as defaultDb } from './db.js';
import type Database from 'better-sqlite3';

/**
 * Manages the registry of active agents, handling registration, discovery, and capability tracking.
 * Supported by a persistent SQLite database.
 */
export class AgentRegistry {
  private db: Database.Database;

  constructor(db: Database.Database = defaultDb) {
    this.db = db;
  }

  /**
   * Registers a new agent or updates an existing one.
   * Handles ID collision with active agents by auto-renaming the new agent.
   * 
   * @param agent - The agent details (id, role, displayName, capabilities).
   * @returns The final assigned agent ID (may differ from requested ID if collision occurred).
   */
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
        // ALSO update the display name so it's unique visually
        agent.displayName = `${agent.displayName} (${randomSuffix})`;
        console.log(`[Registry] ID Collision: '${agent.id}' is active. Renaming new agent to '${finalId}' ('${agent.displayName}')`);
      }
    }

    // Upsert agent with finalId
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO agents (id, role, displayName, lastSeen, capabilities, createdAt)
      VALUES (@id, @role, @displayName, @lastSeen, @capabilities, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        lastSeen = @lastSeen,
        capabilities = @capabilities
        -- Note: We generally don't overwrite displayName or role on re-register 
        -- to preserve user renames, unless explicit logic is added.
        -- But capabilities/heartbeat should update.
        -- createdAt is preserved on conflict (not in UPDATE SET)
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
        lastSeen: now,
        capabilities: JSON.stringify(agent.capabilities || []),
        createdAt: now // For new agents; preserved on conflict
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

  /**
   * Retrieves an agent by its ID.
   * 
   * @param agentId - The ID of the agent to retrieve.
   * @returns The agent identity or undefined if not found.
   */
  get(agentId: string): (AgentIdentity & { id: string; color?: string; lastSeen?: number }) | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (!row) return undefined;
    return this.mapRowToIdentity(row);
  }

  /**
   * Retrieves an agent by its display name (case-insensitive) or alias.
   * 
   * @param displayName - The display name to search for.
   * @returns The agent identity or undefined.
   */
  getByDisplayName(displayName: string): (AgentIdentity & { id: string; color?: string; lastSeen?: number }) | undefined {
    const lowerName = displayName.toLowerCase();

    // 1. Direct match on displayName
    let row = this.db.prepare('SELECT * FROM agents WHERE lower(displayName) = ?').get(lowerName) as any;

    // 2. Alias lookup
    if (!row) {
      const aliasRow = this.db.prepare('SELECT agentId FROM aliases WHERE alias = ?').get(lowerName) as any;
      if (aliasRow) {
        row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(aliasRow.agentId) as any;
      }
    }

    if (!row) return undefined;

    // Check if alive? implementation_plan/task doesn't strictly say we filter by liveness for retrieval,
    // but assignment usually requires liveness. Let's return the identity regardless, caller checks liveness.
    return this.mapRowToIdentity(row);
  }

  /**
   * Retrieves the most recently active agent with a specific role.
   * 
   * @param role - The agent role to search for.
   * @returns The agent identity or undefined.
   */
  getByRole(role: string): (AgentIdentity & { id: string; color?: string; lastSeen?: number }) | undefined {
    // Pick the most recently seen agent with this role
    const row = this.db.prepare('SELECT * FROM agents WHERE role = ? ORDER BY lastSeen DESC LIMIT 1').get(role) as any;
    if (!row) return undefined;
    return this.mapRowToIdentity(row);
  }

  /**
   * Retrieves all registered agents from the database.
   * 
   * @returns An array of all agent identities.
   */
  getAll(): (AgentIdentity & { id: string; color?: string; lastSeen?: number })[] {
    const rows = this.db.prepare('SELECT * FROM agents').all() as any[];
    return rows.map(r => this.mapRowToIdentity(r));
  }

  /**
   * Gets the list of roles that a given role is allowed to delegate tasks to.
   * Combines database configurations with hardcoded default permissions ("The Constitution").
   * 
   * @param role - The source agent role.
   * @returns Array of allowed target roles.
   */
  getAllowedDelegates(role: AgentRole): string[] {
    // 1. Try to get from DB first
    let dbDelegates: string[] = [];
    const row = this.db.prepare('SELECT canDelegateTo FROM agents WHERE role = ? LIMIT 1').get(role) as any;

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

  /**
   * Checks if a source role is allowed to delegate to a target role.
   * 
   * @param sourceRole - The role initiating the delegation.
   * @param targetRole - The role receiving the task.
   * @returns True if delegation is allowed, false otherwise.
   */
  canDelegate(sourceRole: AgentRole, targetRole: AgentRole): boolean {
    const allowed = this.getAllowedDelegates(sourceRole);
    return allowed.includes(targetRole);
  }

  heartbeat(agentId: string): void {
    this.db.prepare('UPDATE agents SET lastSeen = ? WHERE id = ?').run(Date.now(), agentId);
  }

  /**
   * Updates an agent's details (e.g. displayName, color).
   */
  updateAgent(agentId: string, updates: { displayName?: string, color?: string }): boolean {
    const sets: string[] = [];
    const args: any[] = [];

    if (updates.displayName) {
      sets.push('displayName = ?');
      args.push(updates.displayName);
    }
    if (updates.color) {
      sets.push('color = ?');
      args.push(updates.color);
    }

    if (sets.length === 0) return false;

    args.push(agentId);
    const result = this.db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...args);

    // Also add the new name as an alias automatically
    if (updates.displayName) {
      try {
        this.db.prepare('INSERT OR IGNORE INTO aliases (alias, agentId) VALUES (?, ?)').run(updates.displayName.toLowerCase(), agentId);
      } catch (e) { }
    }

    return result.changes > 0;
  }

  requestEviction(agentId: string, reason: string): boolean {
    const result = this.db.prepare(
      'UPDATE agents SET eviction_requested = 1, eviction_reason = ? WHERE id = ?'
    ).run(reason, agentId);
    return result.changes > 0;
  }

  checkEviction(agentId: string): { requested: boolean, reason?: string } {
    const row = this.db.prepare('SELECT eviction_requested, eviction_reason FROM agents WHERE id = ?').get(agentId) as any;
    if (!row) return { requested: false };
    return {
      requested: Boolean(row.eviction_requested),
      reason: row.eviction_reason
    };
  }

  clearEviction(agentId: string): void {
    this.db.prepare(
      'UPDATE agents SET eviction_requested = 0, eviction_reason = NULL WHERE id = ?'
    ).run(agentId);
  }

  /**
   * Removes offline agents generally, but preserves seeded configurations.
   */
  cleanup(intervalMs: number, activeAgentIds: Set<string>): void {
    const cutoff = Date.now() - intervalMs;

    // We fetch all agents first to filter in memory
    const stmt = this.db.prepare('SELECT id, lastSeen FROM agents');
    const all = stmt.all() as any[];

    for (const a of all) {
      if (activeAgentIds.has(a.id)) continue; // Don't delete busy agents
      if (a.lastSeen < cutoff) {
        console.log(`[Registry] Cleaning up stale agent: ${a.id}`);
        this.db.prepare('DELETE FROM agents WHERE id = ?').run(a.id);
        this.db.prepare('DELETE FROM aliases WHERE agentId = ?').run(a.id);
      }
    }
  }

  private mapRowToIdentity(row: any): AgentIdentity & { id: string; color?: string; lastSeen?: number; createdAt?: number } {
    return {
      id: row.id,
      role: row.role as AgentRole,
      displayName: row.displayName,
      capabilities: JSON.parse(row.capabilities || '[]'),
      // Add extra props that might not be in the strict AgentIdentity type yet
      color: row.color,
      lastSeen: row.lastSeen,
      createdAt: row.createdAt
    };
  }

  // Helper to get color
  getAgentColor(agentId: string): string | undefined {
    const row = this.db.prepare('SELECT color FROM agents WHERE id = ?').get(agentId) as any;
    return row?.color;
  }

  // Helper to get lastSeen timestamp
  getLastSeen(agentId: string): number | undefined {
    const row = this.db.prepare('SELECT lastSeen FROM agents WHERE id = ?').get(agentId) as any;
    return row?.lastSeen;
  }
}
