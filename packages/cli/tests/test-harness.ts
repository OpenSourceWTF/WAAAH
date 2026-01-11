/**
 * Test Harness for CLI Adapter Tests
 * 
 * Provides sandboxed mocking for fs, child_process, and environment.
 * All tests use mocks - no real files are touched.
 */
import { vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Mock modules
vi.mock('fs');
vi.mock('child_process');

export const mockFs = vi.mocked(fs);
export const mockExecSync = vi.mocked(execSync);

// Store original env
const originalEnv = { ...process.env };

/**
 * Setup fresh mocks before each test
 */
export function setupTestHarness() {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Reset environment
    process.env = { ...originalEnv };
    process.env.HOME = '/mock/home';

    // Default mock implementations (no-op)
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.mkdirSync.mockReturnValue(undefined);

    mockExecSync.mockImplementation(() => {
      throw new Error('command not found');
    });
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;

    // Ensure all mocks are cleared
    vi.clearAllMocks();
  });
}

/**
 * Mock helpers for common scenarios
 */
export const mockHelpers = {
  /** Mock CLI as installed */
  cliInstalled(name: string) {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === `which ${name}`) {
        return Buffer.from(`/usr/bin/${name}`);
      }
      throw new Error('command not found');
    });
  },

  /** Mock CLI as not installed */
  cliNotInstalled() {
    mockExecSync.mockImplementation(() => {
      throw new Error('command not found');
    });
  },

  /** Mock config file with contents */
  configFile(path: string, contents: object) {
    mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
      if (p === path || (typeof p === 'string' && p.includes(path.split('/').pop()!))) {
        return JSON.stringify(contents);
      }
      throw new Error('ENOENT: no such file');
    });
  },

  /** Mock .env file with API key */
  envFile(apiKey: string) {
    mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
      if (typeof p === 'string' && p.endsWith('.env')) {
        return `WAAAH_API_KEY=${apiKey}`;
      }
      throw new Error('ENOENT: no such file');
    });
  },

  /** Get the last written config */
  getWrittenConfig(): object | null {
    const calls = mockFs.writeFileSync.mock.calls;
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1];
    return JSON.parse(lastCall[1] as string);
  }
};
