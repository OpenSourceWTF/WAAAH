/**
 * SessionManager - Session persistence and recovery
 * 
 * Handles saving and restoring agent session state for crash recovery.
 * Sessions are stored in .waaah/sessions/<session-id>/
 * 
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Session state data structure.
 */
export interface SessionState {
  /** Unique session identifier */
  id: string;
  /** Agent type (gemini, claude) */
  agentType: string;
  /** Active workflow name */
  workflow: string;
  /** Last captured output (last 10KB) */
  lastOutput: string;
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Workspace root path */
  workspaceRoot: string;
  /** Number of times the session was restarted */
  restartCount: number;
  /** Token usage statistics */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * Internal session state for JSON serialization.
 */
interface SerializedSessionState {
  id: string;
  agentType: string;
  workflow: string;
  lastOutput: string;
  createdAt: string;
  updatedAt: string;
  workspaceRoot: string;
  restartCount: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * Maximum size for lastOutput field (10KB).
 */
const MAX_OUTPUT_SIZE = 10 * 1024;

/**
 * Maximum sessions to keep per workspace.
 */
const MAX_SESSIONS = 10;

/**
 * Manages agent session persistence and recovery.
 * 
 * @example
 * ```typescript
 * const session = new SessionManager('/path/to/workspace');
 * const state = await session.create('gemini', 'waaah-orc');
 * await session.save(state);
 * const restored = await session.restore();
 * ```
 */
export class SessionManager {
  private workspaceRoot: string;
  private sessionsDir: string;

  /**
   * Creates a new session manager.
   * @param workspaceRoot - Path to the workspace root
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.sessionsDir = path.join(workspaceRoot, '.waaah', 'sessions');
  }

  /**
   * Generates a unique session ID.
   * @returns Unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `session-${timestamp}-${random}`;
  }

  /**
   * Ensures the sessions directory exists.
   */
  private async ensureSessionsDir(): Promise<void> {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  /**
   * Gets the path to a session's state file.
   * @param sessionId - Session ID
   * @returns Path to the session state file
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId, 'state.json');
  }

  /**
   * Creates a new session.
   * @param agentType - Type of agent (gemini, claude)
   * @param workflow - Workflow name
   * @returns The new session state
   */
  public async create(agentType: string, workflow: string): Promise<SessionState> {
    await this.ensureSessionsDir();

    const id = this.generateSessionId();
    const now = new Date();

    const state: SessionState = {
      id,
      agentType,
      workflow,
      lastOutput: '',
      createdAt: now,
      updatedAt: now,
      workspaceRoot: this.workspaceRoot,
      restartCount: 0,
    };

    // Create session directory
    const sessionDir = path.join(this.sessionsDir, id);
    fs.mkdirSync(sessionDir, { recursive: true });

    // Save initial state
    await this.save(state);

    return state;
  }

  /**
   * Saves the current session state.
   * @param state - Session state to save
   */
  public async save(state: SessionState): Promise<void> {
    await this.ensureSessionsDir();

    const sessionDir = path.join(this.sessionsDir, state.id);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Truncate lastOutput if too large
    let lastOutput = state.lastOutput;
    if (lastOutput.length > MAX_OUTPUT_SIZE) {
      lastOutput = lastOutput.slice(-MAX_OUTPUT_SIZE);
    }

    const serialized: SerializedSessionState = {
      id: state.id,
      agentType: state.agentType,
      workflow: state.workflow,
      lastOutput,
      createdAt: state.createdAt.toISOString(),
      updatedAt: new Date().toISOString(),
      workspaceRoot: state.workspaceRoot,
      restartCount: state.restartCount,
      tokenUsage: state.tokenUsage,
    };

    const statePath = this.getSessionPath(state.id);
    fs.writeFileSync(statePath, JSON.stringify(serialized, null, 2));
  }

  /**
   * Loads a session by ID.
   * @param sessionId - Session ID to load
   * @returns The session state, or null if not found or corrupted
   */
  public async load(sessionId: string): Promise<SessionState | null> {
    const statePath = this.getSessionPath(sessionId);

    if (!fs.existsSync(statePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(statePath, 'utf-8');
      const serialized: SerializedSessionState = JSON.parse(content);

      return {
        id: serialized.id,
        agentType: serialized.agentType,
        workflow: serialized.workflow,
        lastOutput: serialized.lastOutput,
        createdAt: new Date(serialized.createdAt),
        updatedAt: new Date(serialized.updatedAt),
        workspaceRoot: serialized.workspaceRoot,
        restartCount: serialized.restartCount,
        tokenUsage: serialized.tokenUsage,
      };
    } catch (error) {
      // Corrupted file - log and return null
      console.warn(`Warning: Corrupted session file ${statePath}:`, error);
      return null;
    }
  }

  /**
   * Restores the latest session for this workspace.
   * @returns The restored session state, or null if none exists
   */
  public async restore(): Promise<SessionState | null> {
    const sessions = await this.list();

    if (sessions.length === 0) {
      return null;
    }

    // Return the most recently updated session
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return sessions[0];
  }

  /**
   * Lists all sessions for this workspace.
   * @returns Array of session states
   */
  public async list(): Promise<SessionState[]> {
    await this.ensureSessionsDir();

    const sessions: SessionState[] = [];

    if (!fs.existsSync(this.sessionsDir)) {
      return sessions;
    }

    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('session-')) {
        const state = await this.load(entry.name);
        if (state) {
          sessions.push(state);
        }
      }
    }

    return sessions;
  }

  /**
   * Deletes a session.
   * @param sessionId - Session ID to delete
   */
  public async delete(sessionId: string): Promise<void> {
    const sessionDir = path.join(this.sessionsDir, sessionId);

    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }

  /**
   * Cleans up old sessions (keeps last MAX_SESSIONS).
   */
  public async cleanup(): Promise<void> {
    const sessions = await this.list();

    if (sessions.length <= MAX_SESSIONS) {
      return;
    }

    // Sort by updatedAt descending
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    // Delete excess sessions
    const toDelete = sessions.slice(MAX_SESSIONS);
    for (const session of toDelete) {
      await this.delete(session.id);
    }
  }

  /**
   * Updates session output by appending new content.
   * @param sessionId - Session ID
   * @param output - New output to append
   */
  public async appendOutput(sessionId: string, output: string): Promise<void> {
    const state = await this.load(sessionId);
    if (!state) return;

    state.lastOutput += output;
    state.updatedAt = new Date();
    await this.save(state);
  }

  /**
   * Increments the restart count for a session.
   * @param sessionId - Session ID
   * @returns The updated restart count
   */
  public async incrementRestartCount(sessionId: string): Promise<number> {
    const state = await this.load(sessionId);
    if (!state) return 0;

    state.restartCount++;
    state.updatedAt = new Date();
    await this.save(state);

    return state.restartCount;
  }
}
