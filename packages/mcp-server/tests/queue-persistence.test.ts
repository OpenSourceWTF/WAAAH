/**
 * Queue Persistence Tests
 * 
 * Integration tests for queue state persistence (pending ACKs, waiting agents).
 * Uses in-memory SQLite for isolation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { QueuePersistence } from '../src/state/persistence/queue-persistence.js';

describe('QueuePersistence', () => {
  let db: Database.Database;
  let persistence: QueuePersistence;

  beforeEach(() => {
    // Use in-memory database for isolation
    db = new Database(':memory:');

    // Create required tables (minimal schema for tests)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        status TEXT,
        pendingAckAgentId TEXT,
        ackSentAt INTEGER
      );
      
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        displayName TEXT,
        capabilities TEXT,
        workspaceContext JSON,
        waitingSince INTEGER
      );
    `);

    persistence = new QueuePersistence(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('pending ACKs', () => {
    it('sets and gets pending ACK', () => {
      // Insert a task first
      db.prepare('INSERT INTO tasks (id, status) VALUES (?, ?)').run('task-1', 'PENDING_ACK');

      persistence.setPendingAck('task-1', 'agent-1');

      const ack = persistence.getPendingAck('task-1');
      expect(ack).not.toBeNull();
      expect(ack?.agentId).toBe('agent-1');
      expect(ack?.sentAt).toBeGreaterThan(0);
    });

    it('returns null for task without pending ACK', () => {
      db.prepare('INSERT INTO tasks (id, status) VALUES (?, ?)').run('task-2', 'QUEUED');

      const ack = persistence.getPendingAck('task-2');
      expect(ack).toBeNull();
    });

    it('clears pending ACK', () => {
      db.prepare('INSERT INTO tasks (id, status, pendingAckAgentId, ackSentAt) VALUES (?, ?, ?, ?)')
        .run('task-3', 'PENDING_ACK', 'agent-1', Date.now());

      persistence.clearPendingAck('task-3');

      const ack = persistence.getPendingAck('task-3');
      expect(ack).toBeNull();
    });

    it('gets all pending ACKs', () => {
      db.prepare('INSERT INTO tasks (id, status, pendingAckAgentId, ackSentAt) VALUES (?, ?, ?, ?)')
        .run('task-a', 'PENDING_ACK', 'agent-1', Date.now());
      db.prepare('INSERT INTO tasks (id, status, pendingAckAgentId, ackSentAt) VALUES (?, ?, ?, ?)')
        .run('task-b', 'PENDING_ACK', 'agent-2', Date.now());
      db.prepare('INSERT INTO tasks (id, status) VALUES (?, ?)').run('task-c', 'QUEUED');

      const acks = persistence.getPendingAcks();

      expect(acks.size).toBe(2);
      expect(acks.has('task-a')).toBe(true);
      expect(acks.has('task-b')).toBe(true);
    });
  });

  describe('waiting agents', () => {
    it('sets agent as waiting', () => {
      persistence.setAgentWaiting('agent-1', ['code-writing']);

      expect(persistence.isAgentWaiting('agent-1')).toBe(true);
    });

    it('gets waiting agents with capabilities', () => {
      persistence.setAgentWaiting('agent-1', ['code-writing', 'test-writing']);
      persistence.setAgentWaiting('agent-2', ['spec-writing']);

      const waiting = persistence.getWaitingAgents();

      expect(waiting.size).toBe(2);
      expect(waiting.get('agent-1')).toEqual({
        capabilities: ['code-writing', 'test-writing'],
        workspaceContext: undefined
      });
      expect(waiting.get('agent-2')).toEqual({
        capabilities: ['spec-writing'],
        workspaceContext: undefined
      });
    });

    it('clears agent waiting state', () => {
      persistence.setAgentWaiting('agent-1', ['code-writing']);
      expect(persistence.isAgentWaiting('agent-1')).toBe(true);

      persistence.clearAgentWaiting('agent-1');

      expect(persistence.isAgentWaiting('agent-1')).toBe(false);
    });

    it('clears all waiting agents', () => {
      persistence.setAgentWaiting('agent-1', ['code-writing']);
      persistence.setAgentWaiting('agent-2', ['test-writing']);

      persistence.clearAllWaitingAgents();

      expect(persistence.getWaitingAgents().size).toBe(0);
    });

    it('resets waiting agents', () => {
      persistence.setAgentWaiting('agent-1', ['code-writing']);
      persistence.setAgentWaiting('agent-2', ['test-writing']);

      persistence.resetWaitingAgents();

      expect(persistence.isAgentWaiting('agent-1')).toBe(false);
      expect(persistence.isAgentWaiting('agent-2')).toBe(false);
    });

    it('returns false for non-waiting agent', () => {
      db.prepare('INSERT INTO agents (id, displayName) VALUES (?, ?)').run('agent-3', '@Agent3');

      expect(persistence.isAgentWaiting('agent-3')).toBe(false);
    });

    it('returns false for non-existent agent', () => {
      expect(persistence.isAgentWaiting('nonexistent')).toBe(false);
    });
  });
});
