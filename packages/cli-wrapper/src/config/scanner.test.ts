/**
 * MCP Config Scanner Tests
 * 
 * Tests for scanning CLI config files to detect WAAAH MCP configuration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  scanMCPConfig,
  scanGeminiConfig,
  scanClaudeConfig,
  MCPConfig,
  GeminiMCPServerConfig,
  ClaudeMCPServerConfig,
} from './scanner.js';

// Mock fs module
vi.mock('node:fs');

describe('MCP Config Scanner', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockExistsSync = vi.mocked(fs.existsSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('scanGeminiConfig', () => {
    const geminiConfigPath = path.join(os.homedir(), '.gemini', 'settings.json');

    it('should detect WAAAH MCP in gemini config with command format', () => {
      const config = {
        mcpServers: {
          waaah: {
            command: 'node',
            args: ['/path/to/waaah-mcp-proxy/dist/index.js'],
          },
          other: {
            command: 'npx',
            args: ['other-mcp-server'],
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanGeminiConfig();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('waaah');
      expect(result?.command).toBe('node');
      expect(result?.args).toContain('/path/to/waaah-mcp-proxy/dist/index.js');
    });

    it('should detect WAAAH MCP in gemini config with httpUrl format', () => {
      const config = {
        mcpServers: {
          waaah: {
            httpUrl: 'http://localhost:3456/mcp',
            headers: {
              Authorization: 'Bearer test-token',
            },
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanGeminiConfig();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('waaah');
      expect(result?.httpUrl).toBe('http://localhost:3456/mcp');
      expect(result?.headers?.Authorization).toBe('Bearer test-token');
    });

    it('should return null if WAAAH not in gemini config', () => {
      const config = {
        mcpServers: {
          github: {
            httpUrl: 'https://api.github.com/mcp',
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanGeminiConfig();

      expect(result).toBeNull();
    });

    it('should return null if gemini config file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = scanGeminiConfig();

      expect(result).toBeNull();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });

    it('should return null if gemini config is malformed JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json');

      const result = scanGeminiConfig();

      expect(result).toBeNull();
    });

    it('should return null if mcpServers is missing', () => {
      const config = {
        theme: 'dark',
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanGeminiConfig();

      expect(result).toBeNull();
    });
  });

  describe('scanClaudeConfig', () => {
    const claudeConfigPath = path.join(os.homedir(), '.claude', 'claude_desktop_config.json');

    it('should detect WAAAH MCP in claude config', () => {
      const config = {
        mcpServers: {
          waaah: {
            command: 'npx',
            args: ['-y', '@opensourcewtf/waaah-mcp-proxy'],
            env: {
              WAAAH_SERVER: 'http://localhost:3456',
            },
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanClaudeConfig();

      expect(result).not.toBeNull();
      expect(result?.name).toBe('waaah');
      expect(result?.command).toBe('npx');
      expect(result?.env?.WAAAH_SERVER).toBe('http://localhost:3456');
    });

    it('should return null if WAAAH not in claude config', () => {
      const config = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanClaudeConfig();

      expect(result).toBeNull();
    });

    it('should return null if claude config file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      const result = scanClaudeConfig();

      expect(result).toBeNull();
    });

    it('should return null if claude config is malformed', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('not valid json at all');

      const result = scanClaudeConfig();

      expect(result).toBeNull();
    });
  });

  describe('scanMCPConfig', () => {
    it('should scan gemini config at custom path', () => {
      const config = {
        mcpServers: {
          waaah: {
            command: 'node',
            args: ['server.js'],
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanMCPConfig('/custom/path/settings.json', 'gemini');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('waaah');
    });

    it('should scan claude config at custom path', () => {
      const config = {
        mcpServers: {
          waaah: {
            command: 'npx',
            args: ['waaah-proxy'],
          },
        },
      };

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = scanMCPConfig('/custom/path/config.json', 'claude');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('waaah');
    });

    it('should return null for missing files', () => {
      mockExistsSync.mockReturnValue(false);

      const result = scanMCPConfig('/nonexistent/path.json', 'gemini');

      expect(result).toBeNull();
    });

    it('should handle read errors gracefully', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = scanMCPConfig('/protected/file.json', 'gemini');

      expect(result).toBeNull();
    });
  });
});
