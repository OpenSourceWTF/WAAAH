/**
 * Core interfaces for database and repository patterns.
 * These interfaces enable dependency injection and test isolation.
 */
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import type {
  AgentIdentity,
  StandardCapability,
  Task,
  TaskStatus,
  TaskMessage
} from '@opensourcewtf/waaah-types';

// ===== Database Interfaces =====

/**
 * Database configuration options.
 */
export interface DatabaseOptions {
  /** Type of database: 'memory' for tests, 'file' for production */
  type: 'memory' | 'file';
  /** File path (required when type is 'file') */
  path?: string;
}

/**
 * Re-export the database type for consumers.
 */
export type Database = BetterSqlite3Database;

// ===== Agent Repository Interface =====

/**
 * Input for registering a new agent.
 */
export interface AgentInput {
  id: string;
  displayName: string;
  role?: string;
  capabilities: StandardCapability[];
  color?: string;
  workspaceContext?: {
    type: 'local' | 'github';
    repoId: string;
    branch?: string;
    path?: string;
  };
}

/**
 * Repository interface for agent operations.
 * Abstracts database access for agent management.
 */
export interface IAgentRepository {
  /** Register a new agent or update existing */
  register(agent: AgentInput): string;

  /** Get agent by ID */
  get(agentId: string): AgentIdentity | undefined;

  /** Get agent by display name or alias */
  getByDisplayName(displayName: string): AgentIdentity | undefined;

  /** Get agents with a specific capability */
  getByCapability(capability: StandardCapability): AgentIdentity[];

  /** Get all registered agents */
  getAll(): AgentIdentity[];

  /** Update agent heartbeat timestamp */
  heartbeat(agentId: string): void;

  /** Update agent details */
  update(agentId: string, updates: { displayName?: string; color?: string }): boolean;

  /** Request agent eviction */
  requestEviction(agentId: string, reason: string): boolean;

  /** Check if eviction was requested for agent */
  checkEviction(agentId: string): { requested: boolean; reason?: string };

  /** Clear eviction request */
  clearEviction(agentId: string): void;

  /** Delete agent from registry */
  delete(agentId: string): boolean;

  /** Cleanup stale agents */
  cleanup(staleThresholdMs: number, activeAgentIds: Set<string>): void;
}

// ===== Task Repository Interface =====
// Note: ITaskRepository already exists in queue.interface.ts
// This re-export ensures consistent imports

export type { ITaskRepository } from './persistence/task-repository.js';

// ===== Event Log Interface =====

/**
 * Log entry structure.
 */
export interface LogEntry {
  id: number;
  timestamp: number;
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Repository interface for event logging.
 */
export interface IEventLog {
  /** Log an event */
  log(category: string, message: string, metadata?: Record<string, unknown>): void;

  /** Get recent log entries */
  getRecent(limit: number): LogEntry[];

  /** Get logs by category */
  getByCategory(category: string, limit?: number): LogEntry[];

  /** Clear old logs (for maintenance) */
  clearOlderThan(timestampMs: number): number;
}

// ===== Security Events Interface =====

/**
 * Security event structure.
 */
export interface SecurityEvent {
  id: number;
  timestamp: number;
  source: string;
  fromId?: string;
  prompt: string;
  flags: string[];
  action: string;
}

/**
 * Repository interface for security event logging.
 */
export interface ISecurityLog {
  /** Log a security event */
  log(event: Omit<SecurityEvent, 'id'>): void;

  /** Get recent security events */
  getRecent(limit: number): SecurityEvent[];
}
