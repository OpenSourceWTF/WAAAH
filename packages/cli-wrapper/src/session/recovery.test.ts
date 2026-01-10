/**
 * Crash Recovery Tests
 * 
 * Tests for detecting and recovering from crashed agent sessions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CrashRecovery,
  RecoveryStatus,
  RecoveryResult,
  CrashSession,
} from './recovery.js';

// Mock fs module
vi.mock('node:fs');

describe('CrashRecovery', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockWriteFileSync = vi.mocked(fs.writeFileSync);
  const mockExistsSync = vi.mocked(fs.existsSync);
  const mockReaddirSync = vi.mocked(fs.readdirSync);
  const mockRmSync = vi.mocked(fs.rmSync);
  const mockMkdirSync = vi.mocked(fs.mkdirSync);
  const mockStatSync = vi.mocked(fs.statSync);

  let recovery: CrashRecovery;
  const workspacePath = '/test/workspace';
  const sessionsPath = '/test/workspace/.waaah/sessions';

  beforeEach(() => {
    vi.clearAllMocks();
    recovery = new CrashRecovery(workspacePath);
  });

  describe('detectCrashedSession', () => {
    it('should detect crashed session with incomplete status', () => {
      const sessionData = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running', // Not 'completed' or 'exited'
        lastOutput: 'Last seen output',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['session-123'] as never);
      mockReadFileSync.mockReturnValue(JSON.stringify(sessionData));
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
        mtime: new Date(),
      } as fs.Stats);

      const result = recovery.detectCrashedSession();

      expect(result).not.toBeNull();
      expect(result?.id).toBe('session-123');
      expect(result?.status).toBe('running');
    });

    it('should return null if no sessions directory', () => {
      mockExistsSync.mockReturnValue(false);

      const result = recovery.detectCrashedSession();

      expect(result).toBeNull();
    });

    it('should return null if no crashed sessions', () => {
      const sessionData = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'completed', // Session completed normally
        lastOutput: 'Done',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['session-123'] as never);
      mockReadFileSync.mockReturnValue(JSON.stringify(sessionData));
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
        mtime: new Date(),
      } as fs.Stats);

      const result = recovery.detectCrashedSession();

      expect(result).toBeNull();
    });

    it('should handle malformed session files gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['session-123'] as never);
      mockReadFileSync.mockReturnValue('{ invalid json }');
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
        mtime: new Date(),
      } as fs.Stats);

      const result = recovery.detectCrashedSession();

      expect(result).toBeNull();
    });
  });

  describe('resumeSession', () => {
    it('should resume with saved state', async () => {
      const sessionData = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        lastOutput: 'Last output',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sessionData));

      const result = await recovery.resumeSession('session-123');

      expect(result.status).toBe(RecoveryStatus.RESUMED);
      expect(result.session).not.toBeNull();
      expect(result.session?.id).toBe('session-123');
    });

    it('should return NOT_FOUND if session does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await recovery.resumeSession('nonexistent');

      expect(result.status).toBe(RecoveryStatus.NOT_FOUND);
      expect(result.session).toBeNull();
    });

    it('should update session status to resumed', async () => {
      const sessionData = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        lastOutput: 'Last output',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sessionData));

      await recovery.resumeSession('session-123');

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writeCall = mockWriteFileSync.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.status).toBe('resumed');
    });
  });

  describe('declineResume', () => {
    it('should allow user to decline resume', async () => {
      const sessionData = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        lastOutput: 'Last output',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sessionData));

      const result = await recovery.declineResume('session-123');

      expect(result.status).toBe(RecoveryStatus.DECLINED);
    });

    it('should mark declined session as abandoned', async () => {
      const sessionData = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        lastOutput: 'Last output',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(sessionData));

      await recovery.declineResume('session-123');

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writeCall = mockWriteFileSync.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.status).toBe('abandoned');
    });
  });

  describe('cleanupStaleSessions', () => {
    it('should clean sessions older than 24 hours', async () => {
      const now = Date.now();
      const staleMtime = new Date(now - 25 * 60 * 60 * 1000); // 25 hours ago
      const freshMtime = new Date(now - 1 * 60 * 60 * 1000); // 1 hour ago

      const staleSession = {
        id: 'stale-session',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'crashed',
        createdAt: staleMtime.toISOString(),
        updatedAt: staleMtime.toISOString(),
        workspaceRoot: workspacePath,
      };

      const freshSession = {
        id: 'fresh-session',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        createdAt: freshMtime.toISOString(),
        updatedAt: freshMtime.toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['stale-session', 'fresh-session'] as never);

      // Mock stat to return different mtimes
      mockStatSync.mockImplementation((p) => {
        const pathStr = p.toString();
        if (pathStr.includes('stale-session')) {
          return { isDirectory: () => true, mtime: staleMtime } as fs.Stats;
        }
        return { isDirectory: () => true, mtime: freshMtime } as fs.Stats;
      });

      // Mock readFileSync for session data
      mockReadFileSync.mockImplementation((p) => {
        const pathStr = p.toString();
        if (pathStr.includes('stale-session')) {
          return JSON.stringify(staleSession);
        }
        return JSON.stringify(freshSession);
      });

      const cleaned = await recovery.cleanupStaleSessions();

      expect(cleaned).toBe(1);
      expect(mockRmSync).toHaveBeenCalledTimes(1);
      expect(mockRmSync).toHaveBeenCalledWith(
        expect.stringContaining('stale-session'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should preserve sessions newer than 24 hours', async () => {
      const freshMtime = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago

      const freshSession = {
        id: 'fresh-session',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        createdAt: freshMtime.toISOString(),
        updatedAt: freshMtime.toISOString(),
        workspaceRoot: workspacePath,
      };

      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['fresh-session'] as never);
      mockStatSync.mockReturnValue({
        isDirectory: () => true,
        mtime: freshMtime,
      } as fs.Stats);
      mockReadFileSync.mockReturnValue(JSON.stringify(freshSession));

      const cleaned = await recovery.cleanupStaleSessions();

      expect(cleaned).toBe(0);
      expect(mockRmSync).not.toHaveBeenCalled();
    });
  });

  describe('getRecoveryPrompt', () => {
    it('should generate appropriate recovery prompt', () => {
      const session: CrashSession = {
        id: 'session-123',
        agentType: 'gemini',
        workflow: 'waaah-orc',
        status: 'running',
        lastOutput: 'Last seen output here',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        workspaceRoot: workspacePath,
      };

      const prompt = recovery.getRecoveryPrompt(session);

      expect(prompt).toContain('session-123');
      expect(prompt).toContain('gemini');
      expect(prompt).toContain('waaah-orc');
    });
  });
});
