/**
 * Database Factory Tests
 * 
 * Tests for database creation and schema initialization.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createDatabase, createTestDatabase, createProductionDatabase, initializeSchema } from '../src/state/persistence/database-factory.js';

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

    it('creates file-based database with path', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waaah-test-'));
      const dbPath = path.join(tmpDir, 'test.db');

      try {
        const db = createDatabase({ type: 'file', path: dbPath });
        expect(db).toBeDefined();
        expect(db.open).toBe(true);
        expect(fs.existsSync(dbPath)).toBe(true);
        db.close();
      } finally {
        // Cleanup
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        fs.rmdirSync(tmpDir);
      }
    });

    it('creates directory if it does not exist', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waaah-test-'));
      const nestedDir = path.join(tmpDir, 'nested', 'subdir');
      const dbPath = path.join(nestedDir, 'test.db');

      try {
        expect(fs.existsSync(nestedDir)).toBe(false);

        const db = createDatabase({ type: 'file', path: dbPath });
        expect(db).toBeDefined();
        expect(fs.existsSync(nestedDir)).toBe(true);
        expect(fs.existsSync(dbPath)).toBe(true);
        db.close();
      } finally {
        // Cleanup
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        if (fs.existsSync(nestedDir)) fs.rmdirSync(nestedDir);
        if (fs.existsSync(path.join(tmpDir, 'nested'))) fs.rmdirSync(path.join(tmpDir, 'nested'));
        fs.rmdirSync(tmpDir);
      }
    });
  });

  describe('createProductionDatabase', () => {
    const originalEnv = process.env.DB_PATH;

    afterEach(() => {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.DB_PATH = originalEnv;
      } else {
        delete process.env.DB_PATH;
      }
    });

    it('throws error when DB_PATH not set', () => {
      delete process.env.DB_PATH;
      expect(() => createProductionDatabase()).toThrow('DB_PATH environment variable is required');
    });

    it('creates database from DB_PATH environment variable', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waaah-prod-test-'));
      const dbPath = path.join(tmpDir, 'prod.db');
      process.env.DB_PATH = dbPath;

      try {
        const db = createProductionDatabase();
        expect(db).toBeDefined();
        expect(db.open).toBe(true);
        expect(fs.existsSync(dbPath)).toBe(true);
        db.close();
      } finally {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        fs.rmdirSync(tmpDir);
      }
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
