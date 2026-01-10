/**
 * GitUtils - Git workspace detection utilities
 * 
 * Provides utilities for detecting git repositories and workspace roots.
 * 
 * @packageDocumentation
 */

import { execSync } from 'child_process';
import * as readline from 'readline';

/**
 * Git repository information.
 */
export interface GitRepoInfo {
  /** Whether the directory is in a git repository */
  isRepo: boolean;
  /** Root directory of the repository */
  root?: string;
  /** Current branch name */
  branch?: string;
  /** Whether there are uncommitted changes */
  isDirty?: boolean;
}

/**
 * Result of workspace detection.
 */
export interface WorkspaceResult {
  /** The detected workspace path */
  path: string;
  /** Whether it's a git repository */
  isGitRepo: boolean;
  /** Whether the user was warned about no git repo */
  wasWarned: boolean;
  /** Whether git init was offered */
  initOffered: boolean;
  /** Whether git init was executed */
  initExecuted: boolean;
}

/**
 * Provides git workspace detection and utilities.
 * 
 * @example
 * ```typescript
 * const git = new GitUtils();
 * const info = git.getRepoInfo('/path/to/dir');
 * if (!info.isRepo) {
 *   await git.initRepo('/path/to/dir');
 * }
 * ```
 */
export class GitUtils {
  /**
   * Gets information about a git repository.
   * @param cwd - Directory to check
   * @returns Repository information
   */
  public getRepoInfo(cwd: string): GitRepoInfo {
    try {
      const root = execSync('git rev-parse --show-toplevel', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const status = execSync('git status --porcelain', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      return {
        isRepo: true,
        root,
        branch,
        isDirty: status.length > 0,
      };
    } catch {
      return { isRepo: false };
    }
  }

  /**
   * Initializes a git repository.
   * @param cwd - Directory to initialize
   * @returns Promise resolving to the repo root
   * @throws Error if git init fails
   */
  public async initRepo(cwd: string): Promise<string> {
    try {
      execSync('git init', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Return the newly initialized repo root
      const info = this.getRepoInfo(cwd);
      if (info.isRepo && info.root) {
        return info.root;
      }

      // If we still can't detect it, return the cwd
      return cwd;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize git repository: ${message}`);
    }
  }

  /**
   * Checks if git is installed.
   * @returns True if git is available
   */
  public isGitInstalled(): boolean {
    try {
      execSync('git --version', { stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detects the workspace from a given directory.
   * If in a git repo, returns the repo root.
   * If not in a git repo, returns the provided directory.
   * 
   * @param cwd - Starting directory
   * @returns The workspace path (git root or cwd)
   */
  public detectWorkspace(cwd: string): string {
    const info = this.getRepoInfo(cwd);
    return info.isRepo && info.root ? info.root : cwd;
  }

  /**
   * Interactive workspace detection with warning and git init offer.
   * 
   * @param cwd - Starting directory
   * @param options - Detection options
   * @returns Promise resolving to workspace result
   * 
   * @example
   * ```typescript
   * const git = new GitUtils();
   * const result = await git.detectWorkspaceInteractive(process.cwd(), {
   *   warnIfNotRepo: true,
   *   offerInit: true,
   * });
   * console.log(`Workspace: ${result.path}`);
   * ```
   */
  public async detectWorkspaceInteractive(
    cwd: string,
    options: {
      warnIfNotRepo?: boolean;
      offerInit?: boolean;
      silent?: boolean;
    } = {}
  ): Promise<WorkspaceResult> {
    const { warnIfNotRepo = true, offerInit = true, silent = false } = options;

    const result: WorkspaceResult = {
      path: cwd,
      isGitRepo: false,
      wasWarned: false,
      initOffered: false,
      initExecuted: false,
    };

    const info = this.getRepoInfo(cwd);

    if (info.isRepo && info.root) {
      result.path = info.root;
      result.isGitRepo = true;
      return result;
    }

    // Not a git repository
    if (warnIfNotRepo && !silent) {
      console.warn('⚠️  Warning: Not in a git repository.');
      console.warn('   Some features may not work correctly without git.');
      result.wasWarned = true;
    }

    if (offerInit && !silent) {
      result.initOffered = true;
      const shouldInit = await this.promptYesNo('Would you like to initialize a git repository? (y/n): ');

      if (shouldInit) {
        try {
          result.path = await this.initRepo(cwd);
          result.isGitRepo = true;
          result.initExecuted = true;
          console.log(`✅ Initialized git repository at ${result.path}`);
        } catch (error) {
          console.error(`❌ Failed to initialize git: ${error}`);
        }
      }
    }

    return result;
  }

  /**
   * Prompts the user with a yes/no question.
   * @param question - Question to ask
   * @returns Promise resolving to true for yes, false for no
   */
  private promptYesNo(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(question, (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes');
      });
    });
  }

  /**
   * Prints a warning message about not being in a git repo.
   * Useful for non-interactive contexts.
   */
  public printNoRepoWarning(): void {
    console.warn('⚠️  Warning: Not in a git repository.');
    console.warn('   Some features may not work correctly.');
    console.warn('   Consider running: git init');
  }

  /**
   * Gets git init instructions.
   * @returns Instruction string
   */
  public getInitInstructions(): string {
    return `
To initialize a git repository:
  1. Navigate to your project directory
  2. Run: git init
  3. Optionally add a .gitignore file
  4. Run: git add . && git commit -m "Initial commit"
`.trim();
  }
}
