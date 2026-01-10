/**
 * GitUtils - Git workspace detection utilities
 * 
 * Provides utilities for detecting git repositories and workspace roots.
 * 
 * @packageDocumentation
 */

import { execSync } from 'child_process';

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
   */
  public async initRepo(cwd: string): Promise<string> {
    // TODO: Implement git init
    void cwd;
    throw new Error('Not implemented');
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
}
