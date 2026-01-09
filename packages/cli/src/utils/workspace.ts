/**
 * Workspace context inference utilities (S12)
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceContext {
  type: 'local' | 'github';
  repoId: string;
  branch?: string;
  path?: string;
}

/**
 * Infer workspace context from the current directory (S12).
 * Uses git remote and package.json as fallbacks.
 */
export function inferWorkspaceContext(cwd = process.cwd()): WorkspaceContext | undefined {
  try {
    // Try to get git remote origin
    const remoteUrl = execSync('git remote get-url origin', { cwd, encoding: 'utf-8' }).trim();

    // Parse GitHub URL: https://github.com/owner/repo.git or git@github.com:owner/repo.git
    let repoId: string | undefined;
    const httpsMatch = remoteUrl.match(/github\.com\/([^\/]+\/[^\/]+?)(?:\.git)?$/);
    const sshMatch = remoteUrl.match(/github\.com:([^\/]+\/[^\/]+?)(?:\.git)?$/);

    if (httpsMatch) {
      repoId = httpsMatch[1];
    } else if (sshMatch) {
      repoId = sshMatch[1];
    }

    if (repoId) {
      // Get current branch
      let branch: string | undefined;
      try {
        branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
      } catch { /* ignore */ }

      return {
        type: 'github',
        repoId,
        branch,
        path: cwd
      };
    }
  } catch {
    // Not a git repo or git not available
  }

  // Fallback: Use package.json name
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.name) {
        return {
          type: 'local',
          repoId: pkg.name,
          path: cwd
        };
      }
    }
  } catch {
    // No package.json
  }

  // Last resort: Use directory name
  return {
    type: 'local',
    repoId: path.basename(cwd),
    path: cwd
  };
}
