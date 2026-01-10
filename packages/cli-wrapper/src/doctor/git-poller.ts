/**
 * Doctor Agent - Git Polling & State Management
 *
 * Implements FR-1.1, FR-1.2, FR-1.3 from the Doctor Agent Spec.
 *
 * @packageDocumentation
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * State file structure for tracking the last analyzed commit.
 */
export interface DoctorState {
  /** SHA of the last analyzed commit */
  last_sha: string;
  /** ISO timestamp of the last run */
  last_run: string;
}

/**
 * Result of a git change check.
 */
export interface ChangeCheckResult {
  /** Whether changes were detected */
  hasChanges: boolean;
  /** List of changed source files (filtered) */
  changedFiles: string[];
  /** The current HEAD SHA */
  currentSha: string;
  /** The previous SHA we compared against */
  previousSha: string;
}

/**
 * File extensions to include in analysis (source files only).
 */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.rs', '.js', '.jsx'];

/**
 * Patterns to exclude from analysis.
 */
const EXCLUDE_PATTERNS = [
  /node_modules/,
  /\.lock$/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.md$/,
  /\.txt$/,
  /\.json$/, // Exclude JSON config files
  /dist\//,
  /build\//,
  /\.waaah\//,
  /\.git\//,
];

/**
 * Default path for the doctor state file relative to workspace root.
 */
const DEFAULT_STATE_PATH = '.waaah/doctor/state.json';

/**
 * Manages git polling and state persistence for the Doctor agent.
 *
 * @example
 * ```typescript
 * const poller = new GitPoller('/path/to/repo');
 *
 * // Check for changes since last analysis
 * const result = await poller.checkChanges();
 *
 * if (result.hasChanges) {
 *   console.log('Changed files:', result.changedFiles);
 *   // Perform analysis...
 *
 *   // Update state after analysis
 *   await poller.updateState(result.currentSha);
 * }
 * ```
 */
export class GitPoller {
  private workspaceRoot: string;
  private statePath: string;

  /**
   * Creates a new GitPoller instance.
   * @param workspaceRoot - Root directory of the git repository
   * @param statePath - Optional custom path for state file
   */
  constructor(workspaceRoot: string, statePath?: string) {
    this.workspaceRoot = workspaceRoot;
    this.statePath = statePath || path.join(workspaceRoot, DEFAULT_STATE_PATH);
  }

  /**
   * Reads the current state from the state file.
   * @returns The current doctor state, or default empty state if not found
   */
  public readState(): DoctorState {
    try {
      if (fs.existsSync(this.statePath)) {
        const content = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(content) as DoctorState;
      }
    } catch (error) {
      console.error('Error reading state file:', error);
    }
    return { last_sha: '', last_run: '' };
  }

  /**
   * Writes updated state to the state file.
   * @param sha - The SHA to record as last analyzed
   */
  public updateState(sha: string): void {
    const state: DoctorState = {
      last_sha: sha,
      last_run: new Date().toISOString(),
    };

    // Ensure directory exists
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Gets the current HEAD SHA.
   * @returns The current HEAD commit SHA
   */
  public getCurrentSha(): string {
    try {
      const sha = execSync('git rev-parse HEAD', {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return sha;
    } catch (error) {
      console.error('Error getting current SHA:', error);
      return '';
    }
  }

  /**
   * Fetches the latest changes from remote.
   * @param remote - Remote name (default: 'origin')
   * @param branch - Branch name (default: 'main')
   */
  public fetchRemote(remote = 'origin', branch = 'main'): void {
    try {
      execSync(`git fetch ${remote} ${branch}`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      console.error('Error fetching remote:', error);
    }
  }

  /**
   * Checks for changes since the last analyzed commit.
   *
   * Implements FR-1.2 and FR-1.3:
   * - Uses `git diff --name-only` to get changed files
   * - Filters to only include source files (.ts, .tsx, .rs)
   * - Excludes lock files, docs, and other non-source files
   *
   * @returns ChangeCheckResult with change status and filtered file list
   */
  public checkChanges(): ChangeCheckResult {
    const state = this.readState();
    const currentSha = this.getCurrentSha();

    // If no previous SHA, this is a fresh start - consider all files changed
    if (!state.last_sha) {
      return {
        hasChanges: true,
        changedFiles: [],
        currentSha,
        previousSha: '',
      };
    }

    // If SHA hasn't changed, no changes
    if (state.last_sha === currentSha) {
      return {
        hasChanges: false,
        changedFiles: [],
        currentSha,
        previousSha: state.last_sha,
      };
    }

    try {
      // Get changed files between last analyzed SHA and current HEAD
      const output = execSync(`git diff --name-only ${state.last_sha} HEAD`, {
        cwd: this.workspaceRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const allFiles = output.trim().split('\n').filter(Boolean);
      const filteredFiles = this.filterSourceFiles(allFiles);

      return {
        hasChanges: filteredFiles.length > 0,
        changedFiles: filteredFiles,
        currentSha,
        previousSha: state.last_sha,
      };
    } catch (error) {
      console.error('Error checking changes:', error);
      // On error, assume changes to be safe
      return {
        hasChanges: true,
        changedFiles: [],
        currentSha,
        previousSha: state.last_sha,
      };
    }
  }

  /**
   * Filters a list of files to only include source files.
   *
   * Implements FR-1.3:
   * - Only includes .ts, .tsx, .rs files
   * - Excludes locks, assets, and docs
   *
   * @param files - List of file paths to filter
   * @returns Filtered list of source files
   */
  public filterSourceFiles(files: string[]): string[] {
    return files.filter((file) => {
      // Check extension
      const ext = path.extname(file);
      if (!SOURCE_EXTENSIONS.includes(ext)) {
        return false;
      }

      // Check exclude patterns
      for (const pattern of EXCLUDE_PATTERNS) {
        if (pattern.test(file)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Gets a summary report of the current state.
   * @returns Human-readable status string
   */
  public getStatusReport(): string {
    const state = this.readState();
    const currentSha = this.getCurrentSha();

    if (!state.last_sha) {
      return `Doctor State: Fresh start (no previous analysis)\nCurrent HEAD: ${currentSha.slice(0, 8)}`;
    }

    const lastRun = state.last_run ? new Date(state.last_run).toLocaleString() : 'Unknown';
    return `Doctor State:
  Last Analyzed: ${state.last_sha.slice(0, 8)}
  Last Run: ${lastRun}
  Current HEAD: ${currentSha.slice(0, 8)}
  Status: ${state.last_sha === currentSha ? '✅ Up to date' : '⚠️ Changes pending'}`;
  }
}
