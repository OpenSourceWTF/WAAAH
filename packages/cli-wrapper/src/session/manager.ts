/**
 * SessionManager - Session persistence and recovery
 * 
 * Handles saving and restoring agent session state for crash recovery.
 * Sessions are stored in .waaah/sessions/<session-id>/
 * 
 * @packageDocumentation
 */

import * as fs from 'fs/promises';
import * as path from 'path';

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
  /** Last captured output (trailing buffer) */
  lastOutput: string;
  /** Session creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Workspace root path */
  workspaceRoot: string;
  /** Token usage statistics */
  tokenUsage?: {
    input: number;
    output: number;
  };
  /** Whether the session was gracefully terminated */
  gracefulExit?: boolean;
}

/** Maximum number of sessions to keep per workspace */
const MAX_SESSIONS = 10;

/** Output buffer size to keep in session */
const OUTPUT_BUFFER_SIZE = 8192;

/**
 * Generates a unique session ID.
 */
function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `sess-${timestamp}-${random}`;
}

/**
 * Manages agent session persistence and recovery.
 * 
 * @example
 * ```typescript
 * const manager = new SessionManager('/path/to/workspace');
 * const state = await manager.create('gemini', 'waaah-orc');
 * 
 * // Update output buffer periodically
 * state.lastOutput = outputBuffer.slice(-8192);
 * state.updatedAt = new Date();
 * await manager.save(state);
 * 
 * // On crash recovery
 * const restored = await manager.restore();
 * if (restored) {
 *   console.log('Resuming session:', restored.id);
 * }
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
   * Ensures the sessions directory exists.
   * @private
   */
  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * Gets the path to a session file.
   * @private
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  /**
   * Creates a new session.
   * @param agentType - Type of agent (gemini, claude)
   * @param workflow - Workflow name
   * @returns The new session state
   * 
   * @example
   * ```typescript
   * const state = await manager.create('gemini', 'waaah-orc');
   * console.log('Session created:', state.id);
   * ```
   */
  public async create(agentType: string, workflow: string): Promise<SessionState> {
    await this.ensureDir();

    const now = new Date();
    const state: SessionState = {
      id: generateSessionId(),
      agentType,
      workflow,
      lastOutput: '',
      createdAt: now,
      updatedAt: now,
      workspaceRoot: this.workspaceRoot,
    };

    await this.save(state);
    return state;
  }

  /**
   * Saves the current session state.
   * @param state - Session state to save
   * 
   * @example
   * ```typescript
   * state.lastOutput = recentOutput;
   * state.updatedAt = new Date();
   * await manager.save(state);
   * ```
   */
  public async save(state: SessionState): Promise<void> {
    await this.ensureDir();

    // Truncate output buffer if too large
    if (state.lastOutput.length > OUTPUT_BUFFER_SIZE) {
      state.lastOutput = state.lastOutput.slice(-OUTPUT_BUFFER_SIZE);
    }

    const sessionPath = this.getSessionPath(state.id);
    await fs.writeFile(
      sessionPath,
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  }

  /**
   * Restores the latest session for this workspace.
   * @returns The restored session state, or null if none exists
   * 
   * @example
   * ```typescript
   * const restored = await manager.restore();
   * if (restored && !restored.gracefulExit) {
   *   console.log('Recovering from crash...');
   * }
   * ```
   */
  public async restore(): Promise<SessionState | null> {
    const sessions = await this.list();

    if (sessions.length === 0) {
      return null;
    }

    // Return the most recent session
    return sessions.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
  }

  /**
   * Loads a specific session by ID.
   * @param sessionId - Session ID to load
   * @returns The session state, or null if not found
   */
  public async load(sessionId: string): Promise<SessionState | null> {
    try {
      const sessionPath = this.getSessionPath(sessionId);
      const content = await fs.readFile(sessionPath, 'utf-8');
      const state = JSON.parse(content) as SessionState;

      // Convert date strings back to Date objects
      state.createdAt = new Date(state.createdAt);
      state.updatedAt = new Date(state.updatedAt);

      return state;
    } catch {
      return null;
    }
  }

  /**
   * Lists all sessions for this workspace.
   * @returns Array of session states, sorted by update time (newest first)
   */
  public async list(): Promise<SessionState[]> {
    try {
      await this.ensureDir();

      const files = await fs.readdir(this.sessionsDir);
      const sessions: SessionState[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(
            path.join(this.sessionsDir, file),
            'utf-8'
          );
          const state = JSON.parse(content) as SessionState;
          state.createdAt = new Date(state.createdAt);
          state.updatedAt = new Date(state.updatedAt);
          sessions.push(state);
        } catch {
          // Skip invalid session files
        }
      }

      return sessions.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Deletes a session.
   * @param sessionId - Session ID to delete
   */
  public async delete(sessionId: string): Promise<void> {
    const sessionPath = this.getSessionPath(sessionId);
    try {
      await fs.unlink(sessionPath);
    } catch {
      // Ignore if already deleted
    }
  }

  /**
   * Cleans up old sessions (keeps last MAX_SESSIONS).
   * @returns Number of sessions deleted
   */
  public async cleanup(): Promise<number> {
    const sessions = await this.list();

    if (sessions.length <= MAX_SESSIONS) {
      return 0;
    }

    // Delete oldest sessions beyond the limit
    const toDelete = sessions.slice(MAX_SESSIONS);
    for (const session of toDelete) {
      await this.delete(session.id);
    }

    return toDelete.length;
  }

  /**
   * Marks a session as gracefully exited.
   * @param sessionId - Session ID to mark
   */
  public async markGracefulExit(sessionId: string): Promise<void> {
    const state = await this.load(sessionId);
    if (state) {
      state.gracefulExit = true;
      state.updatedAt = new Date();
      await this.save(state);
    }
  }

  /**
   * Updates the output buffer for a session.
   * @param sessionId - Session ID to update
   * @param output - New output to append/set
   */
  public async updateOutput(sessionId: string, output: string): Promise<void> {
    const state = await this.load(sessionId);
    if (state) {
      state.lastOutput = output.slice(-OUTPUT_BUFFER_SIZE);
      state.updatedAt = new Date();
      await this.save(state);
    }
  }
}
