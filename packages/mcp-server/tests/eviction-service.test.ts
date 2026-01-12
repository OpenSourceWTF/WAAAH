/**
 * Eviction Service Tests
 * 
 * Integration tests for agent eviction queueing and consuming.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';
import { EvictionService } from '../src/state/eviction-service.js';

describe('EvictionService', () => {
  let db: Database.Database;
  let service: EvictionService;
  let emitter: EventEmitter;

  beforeEach(() => {
    db = new Database(':memory:');
    emitter = new EventEmitter();

    // Create agents table with eviction columns
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        displayName TEXT,
        eviction_requested INTEGER DEFAULT 0,
        eviction_reason TEXT,
        eviction_action TEXT
      );
    `);

    service = new EvictionService(db, emitter);
  });

  afterEach(() => {
    db.close();
  });

  describe('queueEviction', () => {
    it('queues RESTART eviction for agent', () => {
      db.prepare('INSERT INTO agents (id, displayName) VALUES (?, ?)').run('agent-1', '@Agent1');

      service.queueEviction('agent-1', 'Test reason', 'RESTART');

      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-1') as any;
      expect(agent.eviction_requested).toBe(1);
      expect(agent.eviction_reason).toBe('Test reason');
      expect(agent.eviction_action).toBe('RESTART');
    });

    it('queues SHUTDOWN eviction for agent', () => {
      db.prepare('INSERT INTO agents (id, displayName) VALUES (?, ?)').run('agent-2', '@Agent2');

      service.queueEviction('agent-2', 'Force shutdown', 'SHUTDOWN');

      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-2') as any;
      expect(agent.eviction_action).toBe('SHUTDOWN');
    });

    it('emits eviction event', () => {
      db.prepare('INSERT INTO agents (id, displayName) VALUES (?, ?)').run('agent-3', '@Agent3');

      const listener = vi.fn();
      emitter.on('eviction', listener);

      service.queueEviction('agent-3', 'Evicting', 'RESTART');

      expect(listener).toHaveBeenCalledWith('agent-3');
    });

    it('does not downgrade SHUTDOWN to RESTART', () => {
      db.prepare('INSERT INTO agents (id, displayName, eviction_requested, eviction_action) VALUES (?, ?, ?, ?)')
        .run('agent-4', '@Agent4', 1, 'SHUTDOWN');

      service.queueEviction('agent-4', 'Trying restart', 'RESTART');

      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-4') as any;
      expect(agent.eviction_action).toBe('SHUTDOWN'); // Unchanged
    });

    it('allows upgrading RESTART to SHUTDOWN', () => {
      db.prepare('INSERT INTO agents (id, displayName, eviction_requested, eviction_action) VALUES (?, ?, ?, ?)')
        .run('agent-5', '@Agent5', 1, 'RESTART');

      service.queueEviction('agent-5', 'Force shutdown now', 'SHUTDOWN');

      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-5') as any;
      expect(agent.eviction_action).toBe('SHUTDOWN');
    });
  });

  describe('popEviction', () => {
    it('returns and clears pending eviction', () => {
      db.prepare('INSERT INTO agents (id, displayName, eviction_requested, eviction_reason, eviction_action) VALUES (?, ?, ?, ?, ?)')
        .run('agent-6', '@Agent6', 1, 'Pop me', 'RESTART');

      const eviction = service.popEviction('agent-6');

      expect(eviction).toEqual({ controlSignal: 'EVICT', reason: 'Pop me', action: 'RESTART' });

      // Eviction should be cleared
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-6') as any;
      expect(agent.eviction_requested).toBe(0);
      expect(agent.eviction_reason).toBeNull();
      expect(agent.eviction_action).toBeNull();
    });

    it('returns null when no pending eviction', () => {
      db.prepare('INSERT INTO agents (id, displayName) VALUES (?, ?)').run('agent-7', '@Agent7');

      const eviction = service.popEviction('agent-7');

      expect(eviction).toBeNull();
    });

    it('returns null for non-existent agent', () => {
      const eviction = service.popEviction('nonexistent');
      expect(eviction).toBeNull();
    });

    it('defaults to RESTART action if missing', () => {
      db.prepare('INSERT INTO agents (id, displayName, eviction_requested, eviction_reason) VALUES (?, ?, ?, ?)')
        .run('agent-8', '@Agent8', 1, 'No action set');

      const eviction = service.popEviction('agent-8');

      expect(eviction?.action).toBe('RESTART');
    });
  });
});
