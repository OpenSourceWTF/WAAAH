/**
 * Git Poller Tests
 *
 * Tests for the Doctor agent's git polling and state management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitPoller, type DoctorState } from './git-poller.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

describe('GitPoller', () => {
  let tempDir: string;
  let poller: GitPoller;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-poller-test-'));

    // Initialize a git repo
    execSync('git init', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tempDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tempDir, stdio: 'pipe' });

    // Create initial commit
    fs.writeFileSync(path.join(tempDir, 'test.ts'), 'console.log("hello");');
    execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
    execSync('git commit -m "initial"', { cwd: tempDir, stdio: 'pipe' });

    poller = new GitPoller(tempDir);
  });

  afterEach(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('readState', () => {
    it('should return empty state when no state file exists', () => {
      const state = poller.readState();
      expect(state.last_sha).toBe('');
      expect(state.last_run).toBe('');
    });

    it('should read existing state file', () => {
      const stateDir = path.join(tempDir, '.waaah', 'doctor');
      fs.mkdirSync(stateDir, { recursive: true });

      const mockState: DoctorState = {
        last_sha: 'abc123',
        last_run: '2026-01-10T00:00:00.000Z',
      };
      fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify(mockState));

      const state = poller.readState();
      expect(state.last_sha).toBe('abc123');
      expect(state.last_run).toBe('2026-01-10T00:00:00.000Z');
    });
  });

  describe('updateState', () => {
    it('should create state file with SHA and timestamp', () => {
      poller.updateState('def456');

      const state = poller.readState();
      expect(state.last_sha).toBe('def456');
      expect(state.last_run).toBeTruthy();
    });

    it('should create directory if it does not exist', () => {
      const statePath = path.join(tempDir, '.waaah', 'doctor', 'state.json');
      expect(fs.existsSync(statePath)).toBe(false);

      poller.updateState('ghi789');

      expect(fs.existsSync(statePath)).toBe(true);
    });
  });

  describe('getCurrentSha', () => {
    it('should return current HEAD SHA', () => {
      const sha = poller.getCurrentSha();
      expect(sha).toBeTruthy();
      expect(sha.length).toBe(40); // Full SHA length
    });
  });

  describe('checkChanges', () => {
    it('should detect fresh start when no previous state', () => {
      const result = poller.checkChanges();
      expect(result.hasChanges).toBe(true);
      expect(result.previousSha).toBe('');
      expect(result.currentSha).toBeTruthy();
    });

    it('should return no changes when SHA matches', () => {
      const currentSha = poller.getCurrentSha();
      poller.updateState(currentSha);

      const result = poller.checkChanges();
      expect(result.hasChanges).toBe(false);
      expect(result.changedFiles).toEqual([]);
    });

    it('should detect changes after new commit', () => {
      const initialSha = poller.getCurrentSha();
      poller.updateState(initialSha);

      // Make a change
      fs.writeFileSync(path.join(tempDir, 'new-file.ts'), 'export const x = 1;');
      execSync('git add .', { cwd: tempDir, stdio: 'pipe' });
      execSync('git commit -m "add new file"', { cwd: tempDir, stdio: 'pipe' });

      const result = poller.checkChanges();
      expect(result.hasChanges).toBe(true);
      expect(result.changedFiles).toContain('new-file.ts');
    });
  });

  describe('filterSourceFiles', () => {
    it('should include .ts files', () => {
      const files = ['src/index.ts', 'src/utils.tsx'];
      const filtered = poller.filterSourceFiles(files);
      expect(filtered).toEqual(['src/index.ts', 'src/utils.tsx']);
    });

    it('should exclude node_modules', () => {
      const files = ['src/index.ts', 'node_modules/package/index.ts'];
      const filtered = poller.filterSourceFiles(files);
      expect(filtered).toEqual(['src/index.ts']);
    });

    it('should exclude lock files', () => {
      const files = ['src/index.ts', 'package-lock.json', 'pnpm-lock.yaml'];
      const filtered = poller.filterSourceFiles(files);
      expect(filtered).toEqual(['src/index.ts']);
    });

    it('should exclude markdown and text files', () => {
      const files = ['src/index.ts', 'README.md', 'CHANGELOG.txt'];
      const filtered = poller.filterSourceFiles(files);
      expect(filtered).toEqual(['src/index.ts']);
    });

    it('should exclude dist/build directories', () => {
      const files = ['src/index.ts', 'dist/bundle.js', 'build/main.js'];
      const filtered = poller.filterSourceFiles(files);
      expect(filtered).toEqual(['src/index.ts']);
    });

    it('should include .rs files', () => {
      const files = ['src/main.rs', 'src/lib.rs'];
      const filtered = poller.filterSourceFiles(files);
      expect(filtered).toEqual(['src/main.rs', 'src/lib.rs']);
    });
  });

  describe('getStatusReport', () => {
    it('should report fresh start state', () => {
      const report = poller.getStatusReport();
      expect(report).toContain('Fresh start');
    });

    it('should report up to date status', () => {
      const sha = poller.getCurrentSha();
      poller.updateState(sha);

      const report = poller.getStatusReport();
      expect(report).toContain('Up to date');
    });
  });
});
