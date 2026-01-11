/**
 * Database Factory
 * 
 * Provides explicit database creation with NO DEFAULT PATH.
 * Production MUST set DB_PATH environment variable.
 * Tests MUST use createTestDatabase().
 */
import Database from 'better-sqlite3';
import type { DatabaseOptions } from '../interfaces.js';
import path from 'path';
import fs from 'fs';

/**
 * Creates a database instance based on options.
 * 
 * @param options - Database configuration
 * @returns Database instance
 * @throws Error if file type specified without path
 */
export function createDatabase(options: DatabaseOptions): Database.Database {
  if (options.type === 'memory') {
    return new Database(':memory:');
  }

  if (!options.path) {
    throw new Error(
      'FATAL: Database path required for file-based DB. ' +
      'Set DB_PATH environment variable or use createTestDatabase() for tests.'
    );
  }

  // Ensure directory exists
  const dataDir = path.dirname(options.path);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return new Database(options.path);
}

/**
 * Creates an in-memory database for testing.
 * ALWAYS safe - never touches production data.
 */
export function createTestDatabase(): Database.Database {
  return createDatabase({ type: 'memory' });
}

/**
 * Creates a production database from environment.
 * 
 * @throws Error if DB_PATH not set
 */
export function createProductionDatabase(): Database.Database {
  const dbPath = process.env.DB_PATH;
  if (!dbPath) {
    throw new Error(
      'FATAL: DB_PATH environment variable is required for production. ' +
      'Example: DB_PATH=./data/waaah.db pnpm serve'
    );
  }
  return createDatabase({ type: 'file', path: dbPath });
}

/**
 * Initializes the database schema.
 * Extracted from db.ts to enable schema initialization without side effects.
 * 
 * @param db - Database instance to initialize
 */
export function initializeSchema(db: Database.Database): void {
  // Core tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      displayName TEXT NOT NULL,
      role TEXT,
      color TEXT,
      capabilities TEXT, -- JSON array of StandardCapability
      workspaceContext TEXT, -- JSON object with type, repoId, branch, path
      lastSeen INTEGER,
      createdAt INTEGER,
      eviction_requested BOOLEAN DEFAULT 0,
      eviction_reason TEXT,
      eviction_action TEXT DEFAULT 'RESTART',
      -- DB-backed waiting state (replaces in-memory waitingAgents map)
      waitingCapabilities TEXT, -- JSON array of capabilities agent is waiting with
      waitingSince INTEGER
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
      title TEXT,
      priority TEXT,
      fromAgentId TEXT,
      fromAgentName TEXT,
      toAgentId TEXT,
      toRequiredCapabilities TEXT, -- JSON array of StandardCapability
      toWorkspaceId TEXT,
      context TEXT,
      response TEXT,
      createdAt INTEGER NOT NULL,
      completedAt INTEGER,
      assignedTo TEXT,
      dependencies TEXT,
      history TEXT,
      -- DB-backed pending ACK state (replaces in-memory pendingAcks map)
      ackSentAt INTEGER,
      pendingAckAgentId TEXT
    );

    CREATE TABLE IF NOT EXISTS task_messages (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL,
      fromId TEXT,
      prompt TEXT NOT NULL,
      flags TEXT NOT NULL,
      action TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      metadata TEXT
    );

    -- System prompts (replaces in-memory systemPrompts map)
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agentId TEXT NOT NULL,
      promptType TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      priority TEXT DEFAULT 'normal',
      createdAt INTEGER NOT NULL
    );

    -- Review comments for code review (line-level feedback)
    CREATE TABLE IF NOT EXISTS review_comments (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      lineNumber INTEGER,           -- null for file-level comments
      content TEXT NOT NULL,
      authorRole TEXT NOT NULL,     -- 'user' | 'agent'
      authorId TEXT,
      threadId TEXT,                -- links replies together (parent comment id)
      resolved BOOLEAN DEFAULT 0,
      resolvedBy TEXT,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY(taskId) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_pending_ack ON tasks(status, pendingAckAgentId) WHERE status = 'PENDING_ACK';
    CREATE INDEX IF NOT EXISTS idx_aliases_agentId ON aliases(agentId);
    CREATE INDEX IF NOT EXISTS idx_security_timestamp ON security_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_task_messages_taskId ON task_messages(taskId);
    CREATE INDEX IF NOT EXISTS idx_agents_waiting ON agents(waitingSince) WHERE waitingSince IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_system_prompts_agent ON system_prompts(agentId);
    CREATE INDEX IF NOT EXISTS idx_review_comments_taskId ON review_comments(taskId);
    CREATE INDEX IF NOT EXISTS idx_review_comments_threadId ON review_comments(threadId);
  `);

  // Run migrations for existing databases
  runMigrations(db);
}

/**
 * Runs schema migrations for existing databases.
 * Each migration checks if already applied before executing.
 */
function runMigrations(db: Database.Database): void {
  const taskColumns = db.prepare('PRAGMA table_info(tasks)').all() as any[];
  const agentColumns = db.prepare('PRAGMA table_info(agents)').all() as any[];

  // Task migrations
  const taskMigrations = [
    { column: 'assignedTo', sql: 'ALTER TABLE tasks ADD COLUMN assignedTo TEXT' },
    { column: 'title', sql: 'ALTER TABLE tasks ADD COLUMN title TEXT' },
    { column: 'dependencies', sql: 'ALTER TABLE tasks ADD COLUMN dependencies TEXT' },
    { column: 'history', sql: 'ALTER TABLE tasks ADD COLUMN history TEXT' },
    // DB-backed pending ACK state (replaces in-memory pendingAcks map)
    { column: 'ackSentAt', sql: 'ALTER TABLE tasks ADD COLUMN ackSentAt INTEGER' },
    { column: 'pendingAckAgentId', sql: 'ALTER TABLE tasks ADD COLUMN pendingAckAgentId TEXT' },
    // Capability-based task routing (V7)
    { column: 'toRequiredCapabilities', sql: 'ALTER TABLE tasks ADD COLUMN toRequiredCapabilities TEXT' },
    { column: 'toWorkspaceId', sql: 'ALTER TABLE tasks ADD COLUMN toWorkspaceId TEXT' },
    // Messages JSON column for inline message storage
    { column: 'messages', sql: 'ALTER TABLE tasks ADD COLUMN messages TEXT' }
  ];

  for (const migration of taskMigrations) {
    if (!taskColumns.some((c: any) => c.name === migration.column)) {
      try {
        db.prepare(migration.sql).run();
        console.log(`[DB] Migrated tasks: added ${migration.column}`);
      } catch (e: any) {
        if (!e.message.includes('duplicate column name')) {
          console.error(`[DB] Migration failed (${migration.column}):`, e.message);
        }
      }
    }
  }

  // Agent migrations
  const agentMigrations = [
    { column: 'eviction_requested', sql: 'ALTER TABLE agents ADD COLUMN eviction_requested BOOLEAN DEFAULT 0' },
    { column: 'eviction_reason', sql: 'ALTER TABLE agents ADD COLUMN eviction_reason TEXT' },
    { column: 'createdAt', sql: 'ALTER TABLE agents ADD COLUMN createdAt INTEGER' },
    // DB-backed eviction action
    { column: 'eviction_action', sql: "ALTER TABLE agents ADD COLUMN eviction_action TEXT DEFAULT 'RESTART'" },
    // DB-backed waiting state (replaces in-memory waitingAgents map)
    { column: 'waitingCapabilities', sql: 'ALTER TABLE agents ADD COLUMN waitingCapabilities TEXT' },
    { column: 'waitingSince', sql: 'ALTER TABLE agents ADD COLUMN waitingSince INTEGER' },
    // Workspace context (V7)
    { column: 'workspaceContext', sql: 'ALTER TABLE agents ADD COLUMN workspaceContext TEXT' },
    // Role (Added to fix UI display)
    { column: 'role', sql: 'ALTER TABLE agents ADD COLUMN role TEXT' }
  ];

  for (const migration of agentMigrations) {
    if (!agentColumns.some((c: any) => c.name === migration.column)) {
      try {
        db.prepare(migration.sql).run();
        console.log(`[DB] Migrated agents: added ${migration.column}`);
      } catch (e: any) {
        if (!e.message.includes('duplicate column name')) {
          console.error(`[DB] Migration failed (${migration.column}):`, e.message);
        }
      }
    }
  }

  // Create system_prompts table if not exists (for existing DBs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agentId TEXT NOT NULL,
      promptType TEXT NOT NULL,
      message TEXT NOT NULL,
      payload TEXT,
      priority TEXT DEFAULT 'normal',
      createdAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_system_prompts_agent ON system_prompts(agentId);
  `);
}
