/**
 * CrashRecovery - Session crash detection and recovery
 * 
 * Provides mechanisms for detecting crashed agent sessions and offering
 * users the option to resume from saved state or start fresh.
 * Also handles cleanup of stale sessions older than 24 hours.
 * 
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Recovery operation status.
 */
export enum RecoveryStatus {
  /** Successfully resumed from crashed session */
  RESUMED = 'resumed',
  /** User declined to resume */
  DECLINED = 'declined',
  /** No crashed session found */
  NOT_FOUND = 'not_found',
  /** Error during recovery */
  ERROR = 'error',
}

/**
 * Session status values.
 */
export type SessionStatus =
  | 'running'     // Session is active
  | 'completed'   // Session ended normally
  | 'exited'      // Session exited cleanly
  | 'crashed'     // Session detected as crashed
  | 'resumed'     // Session was resumed after crash
  | 'abandoned';  // User declined to resume

/**
 * Crashed session data structure.
 */
export interface CrashSession {
  /** Unique session identifier */
  id: string;
  /** Agent type (gemini, claude) */
  agentType: string;
  /** Active workflow name */
  workflow: string;
  /** Session status */
  status: SessionStatus;
  /** Last captured output */
  lastOutput?: string;
  /** Session creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Workspace root path */
  workspaceRoot: string;
  /** Token usage statistics */
  tokenUsage?: {
    input: number;
    output: number;
  };
}

/**
 * Result of a recovery operation.
 */
export interface RecoveryResult {
  /** Status of the recovery operation */
  status: RecoveryStatus;
  /** The recovered session, if successful */
  session: CrashSession | null;
  /** Error message, if applicable */
  error?: string;
}

/** Stale session threshold in milliseconds (24 hours) */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Handles crash detection and session recovery.
 * 
 * Scans the sessions directory for incomplete sessions, offers the user
 * a choice to resume or start fresh, and cleans up old stale sessions.
 * 
 * @example
 * ```typescript
 * const recovery = new CrashRecovery('/path/to/workspace');
 * 
 * // Check for crashed sessions on startup
 * const crashed = recovery.detectCrashedSession();
 * if (crashed) {
 *   const prompt = recovery.getRecoveryPrompt(crashed);
 *   console.log(prompt);
 *   
 *   if (userWantsToResume) {
 *     await recovery.resumeSession(crashed.id);
 *   } else {
 *     await recovery.declineResume(crashed.id);
 *   }
 * }
 * 
 * // Clean up old sessions
 * await recovery.cleanupStaleSessions();
 * ```
 */
export class CrashRecovery {
  /** Workspace root path */
  private workspaceRoot: string;

  /** Path to sessions directory */
  private sessionsPath: string;

  /**
   * Creates a new CrashRecovery instance.
   * 
   * @param workspaceRoot - Path to the workspace root directory
   */
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.sessionsPath = path.join(workspaceRoot, '.waaah', 'sessions');
  }

  /**
   * Detects the most recent crashed (incomplete) session.
   * 
   * Scans all sessions and returns the most recently updated one
   * that has an incomplete status (running, not completed/exited).
   * 
   * @returns The crashed session, or null if none found
   */
  public detectCrashedSession(): CrashSession | null {
    if (!fs.existsSync(this.sessionsPath)) {
      return null;
    }

    try {
      const entries = fs.readdirSync(this.sessionsPath);
      let latestCrashed: CrashSession | null = null;
      let latestTime = 0;

      for (const entry of entries) {
        const sessionPath = path.join(this.sessionsPath, entry.toString());

        try {
          const stat = fs.statSync(sessionPath);
          if (!stat.isDirectory()) continue;

          const session = this.loadSession(sessionPath);
          if (!session) continue;

          // Check if session was incomplete (not completed/exited/abandoned)
          if (this.isIncompleteSession(session)) {
            const updateTime = new Date(session.updatedAt).getTime();
            if (updateTime > latestTime) {
              latestTime = updateTime;
              latestCrashed = session;
            }
          }
        } catch {
          // Skip sessions that can't be read
          continue;
        }
      }

      return latestCrashed;
    } catch {
      return null;
    }
  }

  /**
   * Resumes a crashed session.
   * 
   * Updates the session status to 'resumed' and returns the session data.
   * 
   * @param sessionId - ID of the session to resume
   * @returns Recovery result with session data
   */
  public async resumeSession(sessionId: string): Promise<RecoveryResult> {
    const sessionPath = path.join(this.sessionsPath, sessionId);

    if (!fs.existsSync(sessionPath)) {
      return {
        status: RecoveryStatus.NOT_FOUND,
        session: null,
        error: `Session ${sessionId} not found`,
      };
    }

    try {
      const session = this.loadSession(sessionPath);
      if (!session) {
        return {
          status: RecoveryStatus.ERROR,
          session: null,
          error: 'Failed to load session',
        };
      }

      // Update session status to resumed
      session.status = 'resumed';
      session.updatedAt = new Date().toISOString();
      this.saveSession(sessionPath, session);

      return {
        status: RecoveryStatus.RESUMED,
        session,
      };
    } catch (err) {
      return {
        status: RecoveryStatus.ERROR,
        session: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Declines to resume a crashed session.
   * 
   * Marks the session as 'abandoned' so it won't be offered again.
   * 
   * @param sessionId - ID of the session to decline
   * @returns Recovery result
   */
  public async declineResume(sessionId: string): Promise<RecoveryResult> {
    const sessionPath = path.join(this.sessionsPath, sessionId);

    if (!fs.existsSync(sessionPath)) {
      return {
        status: RecoveryStatus.NOT_FOUND,
        session: null,
        error: `Session ${sessionId} not found`,
      };
    }

    try {
      const session = this.loadSession(sessionPath);
      if (!session) {
        return {
          status: RecoveryStatus.ERROR,
          session: null,
          error: 'Failed to load session',
        };
      }

      // Mark as abandoned
      session.status = 'abandoned';
      session.updatedAt = new Date().toISOString();
      this.saveSession(sessionPath, session);

      return {
        status: RecoveryStatus.DECLINED,
        session,
      };
    } catch (err) {
      return {
        status: RecoveryStatus.ERROR,
        session: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Cleans up stale sessions older than 24 hours.
   * 
   * @returns Number of sessions cleaned up
   */
  public async cleanupStaleSessions(): Promise<number> {
    if (!fs.existsSync(this.sessionsPath)) {
      return 0;
    }

    const now = Date.now();
    let cleanedCount = 0;

    try {
      const entries = fs.readdirSync(this.sessionsPath);

      for (const entry of entries) {
        const sessionPath = path.join(this.sessionsPath, entry.toString());

        try {
          const stat = fs.statSync(sessionPath);
          if (!stat.isDirectory()) continue;

          const age = now - stat.mtime.getTime();
          if (age > STALE_THRESHOLD_MS) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
            cleanedCount++;
          }
        } catch {
          // Skip sessions that can't be processed
          continue;
        }
      }

      return cleanedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Generates a recovery prompt for the user.
   * 
   * Creates a human-readable message describing the crashed session
   * and asking if the user wants to resume.
   * 
   * @param session - The crashed session
   * @returns Formatted recovery prompt string
   */
  public getRecoveryPrompt(session: CrashSession): string {
    const createdDate = new Date(session.createdAt).toLocaleString();
    const updatedDate = new Date(session.updatedAt).toLocaleString();

    let prompt = `
🔄 Crashed Session Detected

Session ID: ${session.id}
Agent Type: ${session.agentType}
Workflow: ${session.workflow}
Started: ${createdDate}
Last Update: ${updatedDate}
`;

    if (session.lastOutput) {
      const truncatedOutput = session.lastOutput.length > 200
        ? session.lastOutput.substring(0, 200) + '...'
        : session.lastOutput;
      prompt += `\nLast Output:\n${truncatedOutput}\n`;
    }

    if (session.tokenUsage) {
      prompt += `\nTokens Used: ${session.tokenUsage.input + session.tokenUsage.output}\n`;
    }

    prompt += `\nWould you like to resume this session? (y/n)`;

    return prompt.trim();
  }

  /**
   * Checks if a session is incomplete (potentially crashed).
   */
  private isIncompleteSession(session: CrashSession): boolean {
    const completedStatuses: SessionStatus[] = ['completed', 'exited', 'abandoned'];
    return !completedStatuses.includes(session.status);
  }

  /**
   * Loads session data from disk.
   */
  private loadSession(sessionPath: string): CrashSession | null {
    try {
      const dataPath = path.join(sessionPath, 'session.json');
      const content = fs.readFileSync(dataPath, 'utf-8');
      return JSON.parse(content) as CrashSession;
    } catch {
      return null;
    }
  }

  /**
   * Saves session data to disk.
   */
  private saveSession(sessionPath: string, session: CrashSession): void {
    const dataPath = path.join(sessionPath, 'session.json');
    fs.writeFileSync(dataPath, JSON.stringify(session, null, 2), 'utf-8');
  }
}
