/**
 * Server Context
 * 
 * Dependency injection container for the WAAAH server.
 * Provides explicit creation of production and test contexts.
 */
import type { Database } from 'better-sqlite3';
import { TaskQueue } from './queue.js';
import { TaskRepository } from './task-repository.js';
import { AgentRepository } from './agent-repository.js';
import { EventLog, SecurityLog } from './event-log.js';
import {
  createProductionDatabase,
  createTestDatabase,
  initializeSchema
} from './database-factory.js';
import type {
  ITaskRepository,
  IAgentRepository,
  IEventLog,
  ISecurityLog
} from './interfaces.js';

/**
 * Server context containing all dependencies.
 */
export interface ServerContext {
  /** Underlying database connection */
  db: Database;

  /** Task data access */
  taskRepo: ITaskRepository;

  /** Agent data access */
  agentRepo: IAgentRepository;

  /** Task queue management */
  queue: TaskQueue;

  /** Agent registry/repository */
  registry: AgentRepository;

  /** Activity logging */
  eventLog: IEventLog;

  /** Security event logging */
  securityLog: ISecurityLog;

  /** Close all resources */
  close(): void;

  /** Check if context is healthy */
  isHealthy(): boolean;
}

/**
 * Creates a production server context.
 * 
 * @throws Error if DB_PATH environment variable is not set
 */
export function createProductionContext(): ServerContext {
  const db = createProductionDatabase();
  initializeSchema(db);
  return buildContext(db);
}

/**
 * Creates a test server context with in-memory database.
 * ALWAYS safe - never touches production data.
 */
export function createTestContext(): ServerContext {
  const db = createTestDatabase();
  initializeSchema(db);
  return buildContext(db);
}

/**
 * Builds a server context from a database instance.
 */
function buildContext(db: Database): ServerContext {
  // Create repositories
  const taskRepo = new TaskRepository(db);
  const agentRepo = new AgentRepository(db);
  const eventLog = new EventLog(db);
  const securityLog = new SecurityLog(db);

  // Create high-level services (pass repositories, not raw db)
  const queue = new TaskQueue(taskRepo);
  const registry = agentRepo; // AgentRepository now serves as Registry too

  return {
    db,
    taskRepo,
    agentRepo,
    queue,
    registry,
    eventLog,
    securityLog,

    close() {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    },

    isHealthy() {
      try {
        db.prepare('SELECT 1').get();
        return true;
      } catch {
        return false;
      }
    }
  };
}
