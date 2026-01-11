/**
 * Git Service Tests
 * 
 * Tests for GitService diff generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from '../src/services/git-service.js';

// We need to mock before import
vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: any, cb?: any) => {
    const callback = typeof opts === 'function' ? opts : cb;
    if (callback) {
      callback(null, { stdout: '', stderr: '' });
    }
    return { on: vi.fn() };
  })
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn()
  }
}));

import fs from 'fs/promises';
import { exec } from 'child_process';

describe('GitService', () => {
  let gitService: GitService;
  const workspaceRoot = '/test/workspace';

  beforeEach(() => {
    gitService = new GitService(workspaceRoot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when worktree does not exist', async () => {
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    const diff = await gitService.getDiff('task-123');
    expect(diff).toBeNull();
  });

  it('returns diff when worktree exists', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      setImmediate(() => callback?.(null, { stdout: 'diff --git a/file...\n+added line', stderr: '' }));
      return { on: vi.fn() } as any;
    });

    const diff = await gitService.getDiff('task-123');
    expect(diff).toContain('diff --git');
    expect(diff).toContain('+added line');
  });

  it('throws error when git diff fails', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(exec).mockImplementation((cmd: any, opts: any, cb?: any) => {
      const callback = typeof opts === 'function' ? opts : cb;
      setImmediate(() => callback?.(new Error('Git error'), { stdout: '', stderr: 'fatal: not a git repo' }));
      return { on: vi.fn() } as any;
    });

    await expect(gitService.getDiff('task-123')).rejects.toThrow('Failed to generate diff');
  });
});
