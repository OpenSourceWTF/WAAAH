/**
 * Event Log Implementation
 *
 * Implements IEventLog for database-backed activity logging.
 * Replaces direct db access in events.ts.
 */
import type { Database } from 'better-sqlite3';
import type { IEventLog, LogEntry, ISecurityLog, SecurityEvent } from './interfaces.js';

/** Database row type for logs table */
interface LogRow {
  id: number;
  timestamp: number;
  category: string;
  message: string;
  metadata: string | null;
}

/** Database row type for security_events table */
interface SecurityEventRow {
  id: number;
  timestamp: number;
  source: string;
  fromId: string | null;
  prompt: string;
  flags: string;
  action: string;
}

/**
 * SQLite implementation of IEventLog.
 */
export class EventLog implements IEventLog {
  constructor(private readonly db: Database) { }

  log(category: string, message: string, metadata?: Record<string, unknown>): void {
    this.db.prepare(`
      INSERT INTO logs (timestamp, category, message, metadata)
      VALUES (?, ?, ?, ?)
    `).run(
      Date.now(),
      category,
      message,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  getRecent(limit: number): LogEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as LogRow[];

    return rows.map(r => this.mapRow(r));
  }

  getByCategory(category: string, limit: number = 100): LogEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM logs WHERE category = ? ORDER BY timestamp DESC LIMIT ?
    `).all(category, limit) as LogRow[];

    return rows.map(r => this.mapRow(r));
  }

  clearOlderThan(timestampMs: number): number {
    const result = this.db.prepare('DELETE FROM logs WHERE timestamp < ?').run(timestampMs);
    return result.changes;
  }

  private mapRow(row: LogRow): LogEntry {
    return {
      id: row.id,
      timestamp: row.timestamp,
      category: row.category,
      message: row.message,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}

/**
 * SQLite implementation of ISecurityLog.
 */
export class SecurityLog implements ISecurityLog {
  constructor(private readonly db: Database) { }

  log(event: Omit<SecurityEvent, 'id'>): void {
    this.db.prepare(`
      INSERT INTO security_events (timestamp, source, fromId, prompt, flags, action)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      event.timestamp,
      event.source,
      event.fromId || null,
      event.prompt,
      JSON.stringify(event.flags),
      event.action
    );
  }

  getRecent(limit: number): SecurityEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM security_events ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as SecurityEventRow[];

    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      source: r.source,
      fromId: r.fromId || undefined,
      prompt: r.prompt,
      flags: JSON.parse(r.flags),
      action: r.action
    }));
  }
}
