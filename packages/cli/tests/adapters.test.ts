/**
 * Tests for CLI Adapters
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { geminiAdapter } from '../src/adapters/gemini.js';
import { claudeAdapter } from '../src/adapters/claude.js';
import { getAdapter, getSupportedCLIs, isSupportedCLI } from '../src/adapters/registry.js';
import { ExitCode } from '../src/adapters/types.js';

describe('CLI Adapters', () => {
  describe('Registry', () => {
    it('returns supported CLIs', () => {
      const clis = getSupportedCLIs();
      expect(clis).toContain('gemini');
      expect(clis).toContain('claude');
    });

    it('checks if CLI is supported', () => {
      expect(isSupportedCLI('gemini')).toBe(true);
      expect(isSupportedCLI('claude')).toBe(true);
      expect(isSupportedCLI('unknown')).toBe(false);
    });

    it('gets adapter by name (case insensitive)', () => {
      expect(getAdapter('gemini')).toBe(geminiAdapter);
      expect(getAdapter('GEMINI')).toBe(geminiAdapter);
      expect(getAdapter('Claude')).toBe(claudeAdapter);
      expect(getAdapter('unknown')).toBeUndefined();
    });
  });

  describe('GeminiAdapter', () => {
    it('has correct name and config path', () => {
      expect(geminiAdapter.name).toBe('gemini');
      expect(geminiAdapter.configPath).toContain('.gemini/settings.json');
    });

    it('builds args for new session', () => {
      const args = geminiAdapter.buildArgs('waaah-orc-loop', false);
      expect(args).toContain('-i');
      expect(args).toContain('--yolo');
      expect(args.some(a => a.includes('waaah-orc-loop'))).toBe(true);
    });

    it('builds args for resume session', () => {
      const args = geminiAdapter.buildArgs('waaah-orc-loop', true);
      expect(args).toContain('-i');
      expect(args.some(a => a.includes('Resume'))).toBe(true);
    });
  });

  describe('ClaudeAdapter', () => {
    it('has correct name and config path', () => {
      expect(claudeAdapter.name).toBe('claude');
      expect(claudeAdapter.configPath).toContain('.claude/claude_desktop_config.json');
    });

    it('builds args for new session', () => {
      const args = claudeAdapter.buildArgs('waaah-orc-loop', false);
      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('--mcp-config');
      // Prompt should be first arg
      expect(args[0]).toContain('waaah-orc-loop');
    });

    it('builds args for resume session', () => {
      const args = claudeAdapter.buildArgs('waaah-orc-loop', true);
      expect(args).toContain('--resume');
      expect(args).toContain('--dangerously-skip-permissions');
    });
  });

  describe('ExitCode', () => {
    it('has expected values', () => {
      expect(ExitCode.SUCCESS).toBe(0);
      expect(ExitCode.CLI_NOT_FOUND).toBe(1);
      expect(ExitCode.AUTH_FAILED).toBe(2);
      expect(ExitCode.WORKFLOW_NOT_FOUND).toBe(3);
      expect(ExitCode.MCP_CONFIG_ERROR).toBe(4);
      expect(ExitCode.AGENT_ERROR).toBe(5);
      expect(ExitCode.UNKNOWN_CLI).toBe(6);
    });
  });
});
