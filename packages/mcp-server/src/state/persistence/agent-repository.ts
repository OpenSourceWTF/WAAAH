/**
 * Agent Repository Implementation
 * 
 * Implements IAgentRepository for database-backed agent management.
 * Uses capability-based matching instead of role-based matching.
 */
import type { Database } from 'better-sqlite3';
import type { AgentIdentity, StandardCapability } from '@opensourcewtf/waaah-types';
import { AGENT_OFFLINE_THRESHOLD_MS } from '@opensourcewtf/waaah-types';
import type { IAgentRepository, AgentInput } from '../interfaces.js';
import { emitAgentStatus } from '../eventbus.js';

/** DB row type for agents table */
interface AgentRow {
  id: string;
  displayName: string;
  role: string | null;
  color: string | null;
  capabilities: string | null;
  workspaceContext: string | null;
  lastSeen: number | null;
  createdAt: number | null;
  eviction_requested: number | null;
  eviction_reason: string | null;
}

/** DB row for eviction check */
interface EvictionRow {
  eviction_requested: number | null;
  eviction_reason: string | null;
}

/** DB row for lastSeen query */
interface LastSeenRow { lastSeen: number | null; }

/** DB row for color query */
interface ColorRow { color: string | null; }

/**
 * SQLite implementation of IAgentRepository.
 */
export class AgentRepository implements IAgentRepository {
  constructor(private readonly db: Database) { }

  register(agent: AgentInput): string {
    const now = Date.now();
    const existing = this.get(agent.id);

    if (existing) {
      // Check if existing agent is stale (> 5 min)
      const isStale = !existing.lastSeen || (now - existing.lastSeen > AGENT_OFFLINE_THRESHOLD_MS);

      // Check if this is the same agent re-registering (same displayName = same agent)
      const isSameAgent = existing.displayName === agent.displayName;

      if (!isStale && !isSameAgent) {
        // Active collision from DIFFERENT agent: generate new ID
        const newId = `${agent.id}-${Date.now().toString(36)}`;
        console.log(`[AgentRepo] ID collision for ${agent.id}, assigning ${newId}`);
        return this.register({ ...agent, id: newId });
      }
      // Stale OR same agent re-registering: update existing (fall through to upsert)
      console.log(`[AgentRepo] Re-registering agent ${agent.id} (stale=${isStale}, sameAgent=${isSameAgent})`);
    }

    const stmt = this.db.prepare(`
      INSERT INTO agents (id, displayName, role, color, capabilities, workspaceContext, lastSeen, createdAt)
      VALUES (@id, @displayName, @role, @color, @capabilities, @workspaceContext, @lastSeen, @createdAt)
      ON CONFLICT(id) DO UPDATE SET
        displayName = excluded.displayName,
        color = COALESCE(excluded.color, agents.color),
        capabilities = excluded.capabilities,
        workspaceContext = excluded.workspaceContext,
        displayName = excluded.displayName,
        role = excluded.role,
        color = COALESCE(excluded.color, agents.color),
        capabilities = excluded.capabilities,
        workspaceContext = excluded.workspaceContext,
        lastSeen = excluded.lastSeen
    `);

    stmt.run({
      id: agent.id,
      displayName: agent.displayName,
      role: agent.role || null,
      color: agent.color || null,
      capabilities: JSON.stringify(agent.capabilities),
      workspaceContext: agent.workspaceContext ? JSON.stringify(agent.workspaceContext) : null,
      lastSeen: now,
      createdAt: existing ? existing.lastSeen : now
    });

    // Emit agent status event
    emitAgentStatus(agent.id, 'registered', now);

    return agent.id;
  }

  get(agentId: string): (AgentIdentity & { lastSeen?: number }) | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as AgentRow | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  getByDisplayName(displayName: string): (AgentIdentity & { lastSeen?: number }) | undefined {
    // Check aliases first
    const alias = this.db.prepare(`
      SELECT a.* FROM agents a
      JOIN aliases al ON a.id = al.agentId
      WHERE LOWER(al.alias) = LOWER(?)
    `).get(displayName) as AgentRow | undefined;

    if (alias) return this.mapRow(alias);

    // Then check display names
    const row = this.db.prepare(`
      SELECT * FROM agents WHERE LOWER(displayName) = LOWER(?)
    `).get(displayName) as AgentRow | undefined;

    return row ? this.mapRow(row) : undefined;
  }

  getByCapability(capability: StandardCapability): (AgentIdentity & { lastSeen?: number })[] {
    // Search for agents that have this capability in their capabilities JSON array
    const rows = this.db.prepare(`
      SELECT * FROM agents 
      WHERE capabilities LIKE ? 
      ORDER BY lastSeen DESC
    `).all(`%"${capability}"%`) as AgentRow[];
    return rows.map(r => this.mapRow(r));
  }

  getAll(): (AgentIdentity & { lastSeen?: number; createdAt?: number })[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY lastSeen DESC').all() as AgentRow[];
    return rows.map(r => this.mapRow(r));
  }

  heartbeat(agentId: string): void {
    const now = Date.now();
    this.db.prepare('UPDATE agents SET lastSeen = ? WHERE id = ?').run(now, agentId);
    emitAgentStatus(agentId, 'heartbeat', now);
  }

  update(agentId: string, updates: { displayName?: string; color?: string }): boolean {
    const parts: string[] = [];
    const values: string[] = [];

    if (updates.displayName !== undefined) {
      parts.push('displayName = ?');
      values.push(updates.displayName);
    }
    if (updates.color !== undefined) {
      parts.push('color = ?');
      values.push(updates.color);
    }

    if (parts.length === 0) return false;

    values.push(agentId);
    const result = this.db.prepare(`UPDATE agents SET ${parts.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  requestEviction(agentId: string, reason: string): boolean {
    const result = this.db.prepare(
      'UPDATE agents SET eviction_requested = 1, eviction_reason = ? WHERE id = ?'
    ).run(reason, agentId);
    return result.changes > 0;
  }

  checkEviction(agentId: string): { requested: boolean; reason?: string } {
    const row = this.db.prepare(
      'SELECT eviction_requested, eviction_reason FROM agents WHERE id = ?'
    ).get(agentId) as EvictionRow | undefined;

    if (!row) return { requested: false };
    return {
      requested: !!row.eviction_requested,
      reason: row.eviction_reason || undefined
    };
  }

  clearEviction(agentId: string): void {
    this.db.prepare(
      'UPDATE agents SET eviction_requested = 0, eviction_reason = NULL WHERE id = ?'
    ).run(agentId);
  }

  delete(agentId: string): boolean {
    // Delete aliases first (cascade should handle but being explicit)
    this.db.prepare('DELETE FROM aliases WHERE agentId = ?').run(agentId);
    const result = this.db.prepare('DELETE FROM agents WHERE id = ?').run(agentId);
    return result.changes > 0;
  }

  cleanup(staleThresholdMs: number, activeAgentIds: Set<string>): void {
    const cutoff = Date.now() - staleThresholdMs;
    const staleAgents = this.db.prepare(`
      SELECT id FROM agents WHERE lastSeen < ? OR lastSeen IS NULL
    `).all(cutoff) as { id: string }[];

    for (const agent of staleAgents) {
      if (!activeAgentIds.has(agent.id)) {
        this.delete(agent.id);
        console.log(`[AgentRepo] Cleaned up stale agent: ${agent.id}`);
      }
    }
  }

  /** Alias for update() - maintains compatibility with AgentRegistry API */
  updateAgent(agentId: string, updates: { displayName?: string; color?: string }): boolean {
    return this.update(agentId, updates);
  }

  /** Get lastSeen timestamp for an agent */
  getLastSeen(agentId: string): number | undefined {
    const row = this.db.prepare('SELECT lastSeen FROM agents WHERE id = ?').get(agentId) as LastSeenRow | undefined;
    return row?.lastSeen ?? undefined;
  }

  /** Get color for an agent */
  getAgentColor(agentId: string): string | undefined {
    const row = this.db.prepare('SELECT color FROM agents WHERE id = ?').get(agentId) as ColorRow | undefined;
    return row?.color ?? undefined;
  }

  private mapRow(row: AgentRow): AgentIdentity & { lastSeen?: number; createdAt?: number } {
    let workspaceContext = undefined;
    if (row.workspaceContext) {
      try {
        workspaceContext = JSON.parse(row.workspaceContext);
      } catch {
        // Invalid JSON, skip
      }
    }

    return {
      id: row.id,
      displayName: row.displayName,
      role: row.role || undefined,
      capabilities: row.capabilities ? JSON.parse(row.capabilities) : [],
      color: row.color || undefined,
      lastSeen: row.lastSeen || undefined,
      createdAt: row.createdAt || undefined,
      workspaceContext
    };
  }
}
