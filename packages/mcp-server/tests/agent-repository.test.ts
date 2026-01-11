/**
 * Agent Repository Tests
 * 
 * Integration tests for agent registration and management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AgentRepository } from '../src/state/persistence/agent-repository.js';

// Mock eventbus to prevent socket errors
vi.mock('../src/state/eventbus.js', () => ({
  emitAgentStatus: vi.fn()
}));

describe('AgentRepository', () => {
  let db: Database.Database;
  let repo: AgentRepository;

  beforeEach(() => {
    db = new Database(':memory:');

    // Create agents and aliases tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        displayName TEXT,
        role TEXT,
        color TEXT,
        capabilities TEXT,
        workspaceContext TEXT,
        lastSeen INTEGER,
        createdAt INTEGER,
        waitingSince INTEGER,
        eviction_requested INTEGER DEFAULT 0,
        eviction_reason TEXT,
        eviction_action TEXT
      );

      CREATE TABLE IF NOT EXISTS aliases (
        alias TEXT PRIMARY KEY,
        agentId TEXT,
        FOREIGN KEY (agentId) REFERENCES agents(id) ON DELETE CASCADE
      );
    `);

    repo = new AgentRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('register', () => {
    it('registers new agent', () => {
      const id = repo.register({
        id: 'agent-1',
        displayName: '@TestAgent',
        capabilities: ['code-writing']
      });

      expect(id).toBe('agent-1');
      const agent = repo.get('agent-1');
      expect(agent?.displayName).toBe('@TestAgent');
      expect(agent?.capabilities).toEqual(['code-writing']);
    });

    it('re-registers stale agent', () => {
      // Insert stale agent (very old lastSeen)
      db.prepare(`
        INSERT INTO agents (id, displayName, capabilities, lastSeen)
        VALUES (?, ?, ?, ?)
      `).run('agent-2', '@OldAgent', '[]', Date.now() - 600000); // 10 min ago

      const id = repo.register({
        id: 'agent-2',
        displayName: '@OldAgent',
        capabilities: ['test-writing']
      });

      expect(id).toBe('agent-2');
      const agent = repo.get('agent-2');
      expect(agent?.capabilities).toEqual(['test-writing']);
    });

    it('assigns new ID for active collision from different agent', () => {
      // Insert active agent
      db.prepare(`
        INSERT INTO agents (id, displayName, capabilities, lastSeen)
        VALUES (?, ?, ?, ?)
      `).run('agent-3', '@ActiveAgent', '[]', Date.now());

      const id = repo.register({
        id: 'agent-3',
        displayName: '@DifferentAgent',
        capabilities: []
      });

      expect(id).not.toBe('agent-3');
      expect(id).toContain('agent-3-');
    });
  });

  describe('get', () => {
    it('returns agent by ID', () => {
      repo.register({ id: 'a1', displayName: '@A1', capabilities: [] });

      const agent = repo.get('a1');

      expect(agent?.id).toBe('a1');
      expect(agent?.displayName).toBe('@A1');
    });

    it('returns undefined for non-existent agent', () => {
      expect(repo.get('nonexistent')).toBeUndefined();
    });
  });

  describe('getByDisplayName', () => {
    it('finds agent by display name (case insensitive)', () => {
      repo.register({ id: 'a2', displayName: '@TestAgent', capabilities: [] });

      const agent = repo.getByDisplayName('@testagent');

      expect(agent?.id).toBe('a2');
    });
  });

  describe('getByCapability', () => {
    it('finds agents with specific capability', () => {
      repo.register({ id: 'coder', displayName: '@Coder', capabilities: ['code-writing'] });
      repo.register({ id: 'tester', displayName: '@Tester', capabilities: ['test-writing'] });

      const coders = repo.getByCapability('code-writing');

      expect(coders).toHaveLength(1);
      expect(coders[0].id).toBe('coder');
    });
  });

  describe('getAll', () => {
    it('returns all agents', () => {
      repo.register({ id: 'a1', displayName: '@A1', capabilities: [] });
      repo.register({ id: 'a2', displayName: '@A2', capabilities: [] });

      const all = repo.getAll();

      expect(all).toHaveLength(2);
    });
  });

  describe('heartbeat', () => {
    it('updates lastSeen timestamp', () => {
      repo.register({ id: 'hb1', displayName: '@HB1', capabilities: [] });
      const before = repo.get('hb1')?.lastSeen;

      // Small delay to ensure time changes
      repo.heartbeat('hb1');

      const after = repo.getLastSeen('hb1');
      expect(after).toBeGreaterThanOrEqual(before!);
    });
  });

  describe('update', () => {
    it('updates agent display name', () => {
      repo.register({ id: 'u1', displayName: '@Old', capabilities: [] });

      repo.update('u1', { displayName: '@New' });

      expect(repo.get('u1')?.displayName).toBe('@New');
    });

    it('updates agent color', () => {
      repo.register({ id: 'u2', displayName: '@Colored', capabilities: [] });

      repo.update('u2', { color: '#ff0000' });

      expect(repo.getAgentColor('u2')).toBe('#ff0000');
    });

    it('returns false for empty updates', () => {
      repo.register({ id: 'u3', displayName: '@Empty', capabilities: [] });

      const result = repo.update('u3', {});

      expect(result).toBe(false);
    });
  });

  describe('eviction', () => {
    it('requests eviction', () => {
      repo.register({ id: 'ev1', displayName: '@Evict', capabilities: [] });

      const result = repo.requestEviction('ev1', 'Testing eviction');

      expect(result).toBe(true);
      const eviction = repo.checkEviction('ev1');
      expect(eviction.requested).toBe(true);
      expect(eviction.reason).toBe('Testing eviction');
    });

    it('clears eviction', () => {
      repo.register({ id: 'ev2', displayName: '@ClearEvict', capabilities: [] });
      repo.requestEviction('ev2', 'Will be cleared');

      repo.clearEviction('ev2');

      expect(repo.checkEviction('ev2').requested).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes agent', () => {
      repo.register({ id: 'del1', displayName: '@Delete', capabilities: [] });

      const result = repo.delete('del1');

      expect(result).toBe(true);
      expect(repo.get('del1')).toBeUndefined();
    });

    it('returns false for non-existent agent', () => {
      expect(repo.delete('nonexistent')).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('removes stale agents not in active set', () => {
      // Insert stale agent
      db.prepare(`
        INSERT INTO agents (id, displayName, capabilities, lastSeen)
        VALUES (?, ?, ?, ?)
      `).run('stale', '@Stale', '[]', Date.now() - 600000);

      repo.cleanup(300000, new Set()); // 5 min threshold

      expect(repo.get('stale')).toBeUndefined();
    });

    it('keeps stale agents that are in active set', () => {
      db.prepare(`
        INSERT INTO agents (id, displayName, capabilities, lastSeen)
        VALUES (?, ?, ?, ?)
      `).run('active-stale', '@ActiveStale', '[]', Date.now() - 600000);

      repo.cleanup(300000, new Set(['active-stale']));

      expect(repo.get('active-stale')).toBeDefined();
    });
  });
});
