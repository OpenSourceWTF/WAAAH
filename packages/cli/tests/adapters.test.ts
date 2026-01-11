/**
 * Tests for CLI Adapters
 * 
 * Uses sandboxed test harness - no real files are touched.
 */
import { describe, it, expect } from 'vitest';
import { setupTestHarness, mockHelpers, mockFs, mockExecSync } from './test-harness.js';
import { geminiAdapter } from '../src/adapters/gemini.js';
import { claudeAdapter } from '../src/adapters/claude.js';
import { getAdapter, getSupportedCLIs, isSupportedCLI } from '../src/adapters/registry.js';
import { ExitCode } from '../src/adapters/types.js';

// Setup sandboxed harness with proper cleanup
setupTestHarness();

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

    describe('buildArgs', () => {
      it('builds args for new session', () => {
        const args = geminiAdapter.buildArgs('waaah-orc-loop', false);
        expect(args).toContain('-i');
        expect(args).toContain('--yolo');
        expect(args.some(a => a.includes('waaah-orc-loop'))).toBe(true);
        expect(args.some(a => a.includes('Follow'))).toBe(true);
      });

      it('builds args for resume session', () => {
        const args = geminiAdapter.buildArgs('waaah-orc-loop', true);
        expect(args).toContain('-i');
        expect(args.some(a => a.includes('Resume'))).toBe(true);
      });
    });

    describe('checkInstalled', () => {
      it('returns true when CLI is installed', async () => {
        mockHelpers.cliInstalled('gemini');
        const result = await geminiAdapter.checkInstalled();
        expect(result).toBe(true);
        expect(mockExecSync).toHaveBeenCalledWith('which gemini', { stdio: 'pipe' });
      });

      it('returns false when CLI is not installed', async () => {
        mockHelpers.cliNotInstalled();
        const result = await geminiAdapter.checkInstalled();
        expect(result).toBe(false);
      });
    });

    describe('checkAuth', () => {
      it('returns true (gemini handles auth internally)', async () => {
        const result = await geminiAdapter.checkAuth();
        expect(result).toBe(true);
      });
    });

    describe('getMcpConfig', () => {
      it('returns null when config file does not exist', () => {
        // Default harness throws ENOENT
        const result = geminiAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns null when waaah server not configured', () => {
        mockHelpers.configFile(geminiAdapter.configPath, { mcpServers: {} });
        const result = geminiAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns null when waaah config has no args', () => {
        mockHelpers.configFile(geminiAdapter.configPath, {
          mcpServers: { waaah: { command: 'waaah-proxy' } }
        });
        const result = geminiAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns null when --url arg is missing', () => {
        mockHelpers.configFile(geminiAdapter.configPath, {
          mcpServers: { waaah: { args: ['--other', 'value'] } }
        });
        const result = geminiAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns config when properly configured with API key', () => {
        mockHelpers.configFile(geminiAdapter.configPath, {
          mcpServers: {
            waaah: {
              args: ['--url', 'http://localhost:3000'],
              env: { WAAAH_API_KEY: 'test-key' }
            }
          }
        });
        const result = geminiAdapter.getMcpConfig();
        expect(result).toEqual({ url: 'http://localhost:3000', hasApiKey: true });
      });

      it('returns hasApiKey false when no API key', () => {
        mockHelpers.configFile(geminiAdapter.configPath, {
          mcpServers: { waaah: { args: ['--url', 'http://localhost:3000'] } }
        });
        const result = geminiAdapter.getMcpConfig();
        expect(result).toEqual({ url: 'http://localhost:3000', hasApiKey: false });
      });
    });

    describe('writeMcpConfig', () => {
      it('creates new config when file does not exist', () => {
        // Default harness has no files
        geminiAdapter.writeMcpConfig('http://localhost:3000', 'test-api-key');

        expect(mockFs.mkdirSync).toHaveBeenCalled();
        expect(mockFs.writeFileSync).toHaveBeenCalled();

        const writtenConfig = mockHelpers.getWrittenConfig() as Record<string, unknown>;
        const waaah = (writtenConfig.mcpServers as Record<string, unknown>).waaah as Record<string, unknown>;
        expect(waaah.command).toBe('waaah-proxy');
        expect(waaah.args).toContain('http://localhost:3000');
        expect((waaah.env as Record<string, string>).WAAAH_API_KEY).toBe('test-api-key');
      });

      it('updates existing config preserving other settings', () => {
        mockHelpers.configFile(geminiAdapter.configPath, {
          existingKey: 'value',
          mcpServers: { other: { command: 'other' } }
        });

        geminiAdapter.writeMcpConfig('http://localhost:4000', 'new-key');

        const writtenConfig = mockHelpers.getWrittenConfig() as Record<string, unknown>;
        expect(writtenConfig.existingKey).toBe('value');
        expect((writtenConfig.mcpServers as Record<string, unknown>).other).toBeDefined();
      });

      it('uses fallback API key when empty string provided', () => {
        // When apiKey is empty, it falls back to env or getApiKeyFromEnv
        process.env.WAAAH_API_KEY = 'env-key';

        geminiAdapter.writeMcpConfig('http://localhost:3000', '');

        const writtenConfig = mockHelpers.getWrittenConfig() as Record<string, unknown>;
        const waaah = (writtenConfig.mcpServers as Record<string, unknown>).waaah as Record<string, unknown>;
        expect((waaah.env as Record<string, string>).WAAAH_API_KEY).toBe('env-key');
      });
    });
  });

  describe('ClaudeAdapter', () => {
    it('has correct name and config path', () => {
      expect(claudeAdapter.name).toBe('claude');
      expect(claudeAdapter.configPath).toContain('.claude/claude_desktop_config.json');
    });

    describe('buildArgs', () => {
      it('builds args for new session with prompt first', () => {
        const args = claudeAdapter.buildArgs('waaah-orc-loop', false);
        expect(args).toContain('--dangerously-skip-permissions');
        expect(args).toContain('--mcp-config');
        // Prompt should be first arg
        expect(args[0]).toContain('waaah-orc-loop');
      });

      it('builds args for resume session without prompt', () => {
        const args = claudeAdapter.buildArgs('waaah-orc-loop', true);
        expect(args).toContain('--resume');
        expect(args).toContain('--dangerously-skip-permissions');
        expect(args).not.toContain('waaah-orc-loop'); // No prompt in resume mode
      });
    });

    describe('checkInstalled', () => {
      it('returns true when CLI is installed', async () => {
        mockHelpers.cliInstalled('claude');
        const result = await claudeAdapter.checkInstalled();
        expect(result).toBe(true);
        expect(mockExecSync).toHaveBeenCalledWith('which claude', { stdio: 'pipe' });
      });

      it('returns false when CLI is not installed', async () => {
        mockHelpers.cliNotInstalled();
        const result = await claudeAdapter.checkInstalled();
        expect(result).toBe(false);
      });
    });

    describe('checkAuth', () => {
      it('returns true (auth handled by CLI)', async () => {
        const result = await claudeAdapter.checkAuth();
        expect(result).toBe(true);
      });
    });

    describe('getMcpConfig', () => {
      it('returns null when config file does not exist', () => {
        const result = claudeAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns null when waaah server not configured', () => {
        mockHelpers.configFile(claudeAdapter.configPath, { mcpServers: {} });
        const result = claudeAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns null when --url not in args', () => {
        mockHelpers.configFile(claudeAdapter.configPath, {
          mcpServers: { waaah: { args: ['--other'] } }
        });
        const result = claudeAdapter.getMcpConfig();
        expect(result).toBeNull();
      });

      it('returns config when properly configured', () => {
        mockHelpers.configFile(claudeAdapter.configPath, {
          mcpServers: {
            waaah: {
              args: ['--url', 'http://localhost:3000'],
              env: { WAAAH_API_KEY: 'test-key' }
            }
          }
        });
        const result = claudeAdapter.getMcpConfig();
        expect(result).toEqual({ url: 'http://localhost:3000', hasApiKey: true });
      });

      it('returns hasApiKey false when no env configured', () => {
        mockHelpers.configFile(claudeAdapter.configPath, {
          mcpServers: { waaah: { args: ['--url', 'http://localhost:3000'] } }
        });
        const result = claudeAdapter.getMcpConfig();
        expect(result).toEqual({ url: 'http://localhost:3000', hasApiKey: false });
      });
    });

    describe('writeMcpConfig', () => {
      it('creates new config when file does not exist', () => {
        claudeAdapter.writeMcpConfig('http://localhost:3000', 'test-api-key');

        expect(mockFs.mkdirSync).toHaveBeenCalled();
        expect(mockFs.writeFileSync).toHaveBeenCalled();

        const writtenConfig = mockHelpers.getWrittenConfig() as Record<string, unknown>;
        const waaah = (writtenConfig.mcpServers as Record<string, unknown>).waaah as Record<string, unknown>;
        expect(waaah.command).toBe('waaah-proxy');
        expect(waaah.args).toContain('http://localhost:3000');
      });

      it('preserves existing config when updating', () => {
        mockHelpers.configFile(claudeAdapter.configPath, {
          globalShortcuts: true,
          mcpServers: { existing: { command: 'test' } }
        });

        claudeAdapter.writeMcpConfig('http://localhost:4000', 'key');

        const writtenConfig = mockHelpers.getWrittenConfig() as Record<string, unknown>;
        expect(writtenConfig.globalShortcuts).toBe(true);
        expect((writtenConfig.mcpServers as Record<string, unknown>).existing).toBeDefined();
        expect((writtenConfig.mcpServers as Record<string, unknown>).waaah).toBeDefined();
      });
    });
  });

  describe('getApiKeyFromEnv (utils)', () => {
    it('returns API key from .env file when present', async () => {
      const { getApiKeyFromEnv } = await import('../src/adapters/utils.js');
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.env')) {
          return 'WAAAH_API_KEY=my-secret-key';
        }
        throw new Error('ENOENT');
      });

      const result = getApiKeyFromEnv();
      expect(result).toBe('my-secret-key');
    });

    it('trims whitespace from API key', async () => {
      const { getApiKeyFromEnv } = await import('../src/adapters/utils.js');
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.env')) {
          return 'WAAAH_API_KEY=  spaced-key  ';
        }
        throw new Error('ENOENT');
      });

      const result = getApiKeyFromEnv();
      expect(result).toBe('spaced-key');
    });

    it('returns fallback when .env does not exist', async () => {
      const { getApiKeyFromEnv } = await import('../src/adapters/utils.js');
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = getApiKeyFromEnv();
      expect(result).toBe('dev-key-123');
    });

    it('returns fallback when API key not in .env', async () => {
      const { getApiKeyFromEnv } = await import('../src/adapters/utils.js');
      mockFs.readFileSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.endsWith('.env')) {
          return 'OTHER_VAR=value';
        }
        throw new Error('ENOENT');
      });

      const result = getApiKeyFromEnv();
      expect(result).toBe('dev-key-123');
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
