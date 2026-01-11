/**
 * Database Factory Tests
 * 
 * Tests for database creation and schema initialization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase, createTestDatabase, initializeSchema } from '../src/state/persistence/database-factory.js';

describe('Database Factory', () => {
  describe('createDatabase', () => {
    it('creates in-memory database', () => {
      const db = createDatabase({ type: 'memory' });

      expect(db).toBeDefined();
      expect(db.open).toBe(true);

      db.close();
    });

    it('throws error when file type specified without path', () => {
      expect(() => createDatabase({ type: 'file' })).toThrow('path required');
    });
  });

  describe('createTestDatabase', () => {
    it('creates in-memory database for testing', () => {
      const db = createTestDatabase();

      expect(db).toBeDefined();
      expect(db.open).toBe(true);

      db.close();
    });
  });

  describe('initializeSchema', () => {
    let db: Database.Database;

    beforeEach(() => {
      db = new Database(':memory:');
    });

    afterEach(() => {
      db.close();
    });

    it('creates agents table', () => {
      initializeSchema(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates tasks table', () => {
      initializeSchema(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates task_messages table', () => {
      initializeSchema(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='task_messages'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates aliases table', () => {
      initializeSchema(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='aliases'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates review_comments table', () => {
      initializeSchema(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='review_comments'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates system_prompts table', () => {
      initializeSchema(db);

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='system_prompts'").all();
      expect(tables).toHaveLength(1);
    });

    it('creates indexes', () => {
      initializeSchema(db);

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'").all();
      expect(indexes.length).toBeGreaterThan(0);
    });

    it('is idempotent (can be called multiple times)', () => {
      initializeSchema(db);
      initializeSchema(db); // Should not throw

      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      expect(tables.length).toBeGreaterThan(0);
    });
  });
});
