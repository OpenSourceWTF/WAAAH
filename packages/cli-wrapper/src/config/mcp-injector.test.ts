import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { MCPInjector, AgentType, MCPServerConfig } from './mcp-injector.js';
import { promptProxyMethod } from '../utils/prompts.js';

vi.mock('fs/promises');
vi.mock('readline');
vi.mock('../utils/prompts.js', () => ({
  promptProxyMethod: vi.fn().mockResolvedValue('global')
}));

describe('MCPInjector', () => {
  let injector: MCPInjector;
  const mockFs = vi.mocked(fs);
  const mockReadline = vi.mocked(readline);

  beforeEach(() => {
    vi.clearAllMocks();
    injector = new MCPInjector();
  });

  describe('getConfigPath', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, HOME: '/mock/home' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return correct path for gemini', () => {
      expect(injector.getConfigPath('gemini')).toBe('/mock/home/.gemini/settings.json');
    });

    it('should return correct path for claude', () => {
      expect(injector.getConfigPath('claude')).toBe('/mock/home/.claude/claude_desktop_config.json');
    });

    it('should throw error for unknown agent type', () => {
      expect(() => injector.getConfigPath('unknown' as AgentType)).toThrow();
    });
  });

  describe('hasWaaahConfig', () => {
    it('should return true when waaah config exists', async () => {
      const config = { mcpServers: { waaah: {} } };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      
      const result = await injector.hasWaaahConfig('gemini');
      expect(result).toBe(true);
    });

    it('should return false when waaah config missing', async () => {
      const config = { mcpServers: { other: {} } };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));
      
      const result = await injector.hasWaaahConfig('gemini');
      expect(result).toBe(false);
    });

    it('should return false on read error', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Read error'));
      
      const result = await injector.hasWaaahConfig('gemini');
      expect(result).toBe(false);
    });
  });

  describe('inject', () => {
    it('should inject config and create backup', async () => {
      const existingConfig = { mcpServers: {} };
      mockFs.access.mockResolvedValue(undefined); // File exists
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const config: MCPServerConfig = { url: 'http://test.url' };
      const backupPath = await injector.inject('gemini', config, 'global');

      expect(backupPath).toContain('.backup.');
      expect(mockFs.copyFile).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('settings.json'),
        expect.stringContaining('waaah-proxy'),
        'utf-8'
      );
    });

    it('should handle npx method', async () => {
      const existingConfig = {};
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
      mockFs.writeFile.mockResolvedValue(undefined);

      const config: MCPServerConfig = { url: 'http://test.url' };
      await injector.inject('gemini', config, 'npx');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('@opensourcewtf/waaah-mcp-proxy'),
        'utf-8'
      );
    });
    
    it('should include API key if provided', async () => {
        const existingConfig = {};
        mockFs.access.mockResolvedValue(undefined);
        mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
        mockFs.writeFile.mockResolvedValue(undefined);
  
        const config: MCPServerConfig = { url: 'http://test.url', apiKey: 'secret' };
        await injector.inject('gemini', config, 'global');
  
        expect(mockFs.writeFile).toHaveBeenCalledWith(
          expect.any(String),
          expect.stringContaining('WAAAH_API_KEY'),
          'utf-8'
        );
    });
  });

  describe('remove', () => {
    it('should remove waaah config if exists', async () => {
      const existingConfig = { mcpServers: { waaah: {}, other: {} } };
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));
      mockFs.access.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      const backupPath = await injector.remove('gemini');

      expect(backupPath).toBeTruthy();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('waaah'),
        'utf-8'
      );
    });

    it('should do nothing if config does not exist', async () => {
      const existingConfig = { mcpServers: { other: {} } };
      mockFs.readFile.mockResolvedValue(JSON.stringify(existingConfig));

      const result = await injector.remove('gemini');

      expect(result).toBeNull();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('getWaaahConfig', () => {
    it('should return config when present', async () => {
      const config = {
        mcpServers: {
          waaah: {
            command: 'waaah-proxy',
            args: ['--url', 'http://saved.url'],
            env: { WAAAH_API_KEY: 'saved-key' }
          }
        }
      };
      mockFs.readFile.mockResolvedValue(JSON.stringify(config));

      const result = await injector.getWaaahConfig('gemini');

      expect(result).toEqual({
        url: 'http://saved.url',
        apiKey: 'saved-key'
      });
    });

    it('should return null when missing', async () => {
      mockFs.readFile.mockResolvedValue('{}');
      const result = await injector.getWaaahConfig('gemini');
      expect(result).toBeNull();
    });
  });

  describe('promptForConfig', () => {
    it('should prompt for url and api key', async () => {
      const mockQuestion = vi.fn()
        .mockImplementationOnce((q, cb) => cb('http://input.url'))
        .mockImplementationOnce((q, cb) => cb('input-key'));

      mockReadline.createInterface.mockReturnValue({
        question: mockQuestion,
        close: vi.fn()
      } as any);

      const config = await injector.promptForConfig();

      expect(config).toEqual({ url: 'http://input.url', apiKey: 'input-key' });
      expect(mockQuestion).toHaveBeenCalledTimes(2);
    });

    it('should use default url and optional key', async () => {
      const mockQuestion = vi.fn()
        .mockImplementationOnce((q, cb) => cb('')) // Empty URL -> default
        .mockImplementationOnce((q, cb) => cb('')); // Empty Key -> undefined

      mockReadline.createInterface.mockReturnValue({
        question: mockQuestion,
        close: vi.fn()
      } as any);

      const config = await injector.promptForConfig();

      expect(config.url).toContain('localhost');
      expect(config.apiKey).toBeUndefined();
    });
  });

  describe('configureInteractive', () => {
    it('should prompt method and inject', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const injectSpy = vi.spyOn(injector, 'inject').mockResolvedValue('backup-path');
      
      await injector.configureInteractive('gemini', 'http://test.url');

      expect(promptProxyMethod).toHaveBeenCalled();
      expect(injectSpy).toHaveBeenCalledWith('gemini', { url: 'http://test.url' }, 'global');
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
