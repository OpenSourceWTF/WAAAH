import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = util.promisify(exec);

export class GitService {
  constructor(private workspaceRoot: string) { }

  /**
   * Gets the diff for a task's feature branch.
   * Logic:
   * 1. Check if worktree exists.
   * 2. If yes, runs `git diff origin/main...HEAD` in worktree.
   * 3. (Future) could support other strategies.
   */
  async getDiff(taskId: string): Promise<string | null> {
    const branchName = `feature-${taskId}`;
    const worktreePath = path.join(this.workspaceRoot, '.worktrees', branchName);

    try {
      await fs.access(worktreePath);
    } catch {
      return null;
    }

    try {
      // Diff against origin/main to see what this branch adds
      const { stdout } = await execAsync('git diff origin/main...HEAD', { cwd: worktreePath });
      return stdout;
    } catch (error) {
      console.warn(`[GitService] Failed to get diff for ${taskId}`, error);
      throw new Error('Failed to generate diff');
    }
  }


}
