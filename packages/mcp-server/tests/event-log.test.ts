/**
 * Event Log Tests
 * 
 * Tests for EventLog and SecurityLog implementations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { EventLog, SecurityLog } from '../src/state/event-log.js';

describe('EventLog', () => {
  let db: Database.Database;
  let eventLog: EventLog;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT
      )
    `);
    eventLog = new EventLog(db);
  });

  afterEach(() => {
    db.close();
  });

  it('logs events with metadata', () => {
    eventLog.log('TEST', 'Test message', { key: 'value' });

    const entries = eventLog.getRecent(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('TEST');
    expect(entries[0].message).toBe('Test message');
    expect(entries[0].metadata).toEqual({ key: 'value' });
  });

  it('logs events without metadata', () => {
    eventLog.log('TEST', 'No metadata');

    const entries = eventLog.getRecent(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].metadata).toBeUndefined();
  });

  it('returns entries in reverse chronological order', () => {
    const now = Date.now();
    db.prepare('INSERT INTO logs (timestamp, category, message) VALUES (?, ?, ?)').run(now - 2000, 'TEST', 'First');
    db.prepare('INSERT INTO logs (timestamp, category, message) VALUES (?, ?, ?)').run(now - 1000, 'TEST', 'Second');
    db.prepare('INSERT INTO logs (timestamp, category, message) VALUES (?, ?, ?)').run(now, 'TEST', 'Third');

    const entries = eventLog.getRecent(10);
    expect(entries[0].message).toBe('Third');
    expect(entries[2].message).toBe('First');
  });

  it('filters by category', () => {
    eventLog.log('CAT_A', 'A1');
    eventLog.log('CAT_B', 'B1');
    eventLog.log('CAT_A', 'A2');

    const catAEntries = eventLog.getByCategory('CAT_A');
    expect(catAEntries).toHaveLength(2);
    expect(catAEntries.every(e => e.category === 'CAT_A')).toBe(true);
  });

  it('clears old entries', () => {
    const oldTime = Date.now() - 100000;
    db.prepare('INSERT INTO logs (timestamp, category, message) VALUES (?, ?, ?)').run(oldTime, 'OLD', 'Old entry');
    eventLog.log('NEW', 'New entry');

    const clearedCount = eventLog.clearOlderThan(Date.now() - 50000);
    expect(clearedCount).toBe(1);

    const remaining = eventLog.getRecent(10);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].category).toBe('NEW');
  });
});

describe('SecurityLog', () => {
  let db: Database.Database;
  let securityLog: SecurityLog;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        source TEXT NOT NULL,
        fromId TEXT,
        prompt TEXT NOT NULL,
        flags TEXT NOT NULL,
        action TEXT NOT NULL
      )
    `);
    securityLog = new SecurityLog(db);
  });

  afterEach(() => {
    db.close();
  });

  it('logs security events', () => {
    securityLog.log({
      timestamp: Date.now(),
      source: 'agent',
      fromId: 'agent-1',
      prompt: 'Test prompt',
      flags: ['flag1', 'flag2'],
      action: 'BLOCKED'
    });

    const events = securityLog.getRecent(10);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('agent');
    expect(events[0].fromId).toBe('agent-1');
    expect(events[0].flags).toEqual(['flag1', 'flag2']);
    expect(events[0].action).toBe('BLOCKED');
  });

  it('handles events without fromId', () => {
    securityLog.log({
      timestamp: Date.now(),
      source: 'user',
      prompt: 'User prompt',
      flags: [],
      action: 'ALLOWED'
    });

    const events = securityLog.getRecent(10);
    expect(events).toHaveLength(1);
    expect(events[0].fromId).toBeUndefined();
  });
});
