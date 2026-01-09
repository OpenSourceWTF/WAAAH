/**
 * Test harness for isolated database testing.
 * Provides a clean test context with isolated database for each test.
 */
import { TaskQueue } from '../src/state/queue.js';
import { AgentRegistry } from '../src/state/registry.js';
import Database from 'better-sqlite3';
import { beforeEach, afterEach } from 'vitest';

export interface TestContext {
  db: Database.Database;
  queue: TaskQueue;
  registry: AgentRegistry;
  cleanup: () => void;
}

/**
 * Creates an isolated test context with in-memory database.
 */
export function createTestContext(): TestContext {
  // Create in-memory database for isolation
  const sqlite = new Database(':memory:');

  // Initialize schema (same as db.ts)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      displayName TEXT NOT NULL,
      color TEXT,
      capabilities TEXT,
      lastSeen INTEGER,
      createdAt INTEGER,
      eviction_requested BOOLEAN DEFAULT 0,
      eviction_reason TEXT,
      canDelegateTo TEXT
    );

    CREATE TABLE IF NOT EXISTS aliases (
      alias TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      FOREIGN KEY(agentId) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      prompt TEXT NOT NULL,
      priority TEXT,
      fromAgentId TEXT,
      fromAgentName TEXT,
      toAgentId TEXT,
      toAgentRole TEXT,
      assignedTo TEXT,
      context TEXT,
      response TEXT,
      messages TEXT,
      history TEXT,
      createdAt INTEGER,
      completedAt INTEGER,
      spec TEXT,
      workspace TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      taskId TEXT,
      agentId TEXT,
      message TEXT,
      metadata TEXT
    );
  `);

  // Create queue and registry with isolated db
  const queue = new TaskQueue(sqlite);
  const registry = new AgentRegistry(sqlite);

  const cleanup = () => {
    try {
      sqlite.close();
    } catch {
      // Ignore close errors
    }
  };

  return { db: sqlite, queue, registry, cleanup };
}

/**
 * Helper to setup/teardown test context in describe blocks.
 */
export function useTestContext(): { getContext: () => TestContext } {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx?.cleanup();
  });

  return {
    getContext: () => ctx
  };
}
