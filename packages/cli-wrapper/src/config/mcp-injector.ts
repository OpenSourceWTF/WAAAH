/**
 * MCPInjector - MCP configuration injection
 * 
 * Detects and injects WAAAH MCP configuration into CLI agent config files.
 * Supports gemini (~/.gemini/settings.json) and claude (~/.claude/claude_desktop_config.json).
 * 
 * @packageDocumentation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';

/** WAAAH MCP server name used in config files */
const WAAAH_MCP_NAME = 'waaah';

/** Default server address */
const DEFAULT_SERVER_URL = 'http://localhost:3456';

/**
 * MCP server configuration.
 */
export interface MCPServerConfig {
  /** Server URL */
  url: string;
  /** Optional API key */
  apiKey?: string;
}

/**
 * Supported CLI agent types.
 */
export type AgentType = 'gemini' | 'claude';

/**
 * Gemini settings.json structure for MCP servers.
 */
interface GeminiMCPConfig {
  mcpServers?: Record<string, {
    url?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  [key: string]: unknown;
}

/**
 * Claude config structure for MCP servers.
 */
interface ClaudeMCPConfig {
  mcpServers?: Record<string, {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  [key: string]: unknown;
}

/**
 * Handles MCP configuration detection and injection.
 * 
 * This class manages the lifecycle of WAAAH MCP configuration in CLI agent
 * config files. It provides backup, merge, and interactive prompting capabilities.
 * 
 * @example
 * ```typescript
 * const injector = new MCPInjector();
 * const hasConfig = await injector.hasWaaahConfig('gemini');
 * if (!hasConfig) {
 *   const config = await injector.promptForConfig();
 *   await injector.inject('gemini', config);
 * }
 * ```
 */
export class MCPInjector {
  /**
   * Gets the config file path for an agent type.
   * @param agentType - The agent type
   * @returns Path to the config file
   */
  public getConfigPath(agentType: AgentType): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    switch (agentType) {
      case 'gemini':
        return `${home}/.gemini/settings.json`;
      case 'claude':
        return `${home}/.claude/claude_desktop_config.json`;
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }

  /**
   * Checks if WAAAH MCP is configured for an agent.
   * @param agentType - The agent type to check
   * @returns Promise resolving to true if configured
   * 
   * @example
   * ```typescript
   * if (await injector.hasWaaahConfig('gemini')) {
   *   console.log('WAAAH is already configured');
   * }
   * ```
   */
  public async hasWaaahConfig(agentType: AgentType): Promise<boolean> {
    const configPath = this.getConfigPath(agentType);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as GeminiMCPConfig | ClaudeMCPConfig;

      return !!(config.mcpServers && WAAAH_MCP_NAME in config.mcpServers);
    } catch (error) {
      // File doesn't exist or is invalid
      return false;
    }
  }

  /**
   * Creates a backup of the existing config file.
   * @param configPath - Path to the config file
   * @returns Promise resolving to the backup path, or null if no file to backup
   * 
   * @private
   */
  private async createBackup(configPath: string): Promise<string | null> {
    try {
      await fs.access(configPath);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${configPath}.backup.${timestamp}`;

      await fs.copyFile(configPath, backupPath);
      return backupPath;
    } catch {
      // File doesn't exist, no backup needed
      return null;
    }
  }

  /**
   * Reads the existing config file or returns an empty config.
   * @param configPath - Path to the config file
   * @returns Promise resolving to the parsed config
   * 
   * @private
   */
  private async readConfig(configPath: string): Promise<GeminiMCPConfig | ClaudeMCPConfig> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  /**
   * Ensures the config directory exists.
   * @param configPath - Path to the config file
   * 
   * @private
   */
  private async ensureDir(configPath: string): Promise<void> {
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Injects WAAAH MCP configuration into agent config.
   * 
   * Creates a backup of the existing config before modifying.
   * Merges with existing config, preserving other MCP servers.
   * 
   * @param agentType - The agent type
   * @param config - MCP server configuration
   * @returns Promise resolving to the backup path (if created)
   * 
   * @throws {Error} If the config file cannot be written
   * 
   * @example
   * ```typescript
   * const backupPath = await injector.inject('gemini', {
   *   url: 'http://localhost:3456',
   *   apiKey: 'optional-key'
   * });
   * console.log('Backup created at:', backupPath);
   * ```
   */
  public async inject(agentType: AgentType, config: MCPServerConfig): Promise<string | null> {
    const configPath = this.getConfigPath(agentType);

    // Create backup before modifying
    const backupPath = await this.createBackup(configPath);

    // Read existing config
    const existingConfig = await this.readConfig(configPath);

    // Ensure mcpServers exists
    if (!existingConfig.mcpServers) {
      existingConfig.mcpServers = {};
    }

    // Create the WAAAH MCP entry based on agent type
    if (agentType === 'gemini') {
      // Gemini uses URL-based config
      existingConfig.mcpServers[WAAAH_MCP_NAME] = {
        url: config.url,
        ...(config.apiKey && {
          env: { WAAAH_API_KEY: config.apiKey }
        })
      };
    } else {
      // Claude uses command-based config - use local proxy from monorepo
      // Find the monorepo root relative to this file
      const proxyPath = path.resolve(__dirname, '../../..', 'mcp-proxy/dist/index.js');
      existingConfig.mcpServers[WAAAH_MCP_NAME] = {
        command: 'node',
        args: [proxyPath, '--url', config.url],
        ...(config.apiKey && {
          env: { WAAAH_API_KEY: config.apiKey }
        })
      };
    }

    // Ensure directory exists
    await this.ensureDir(configPath);

    // Write the updated config
    await fs.writeFile(
      configPath,
      JSON.stringify(existingConfig, null, 2),
      'utf-8'
    );

    return backupPath;
  }

  /**
   * Removes WAAAH MCP configuration from agent config.
   * 
   * Creates a backup before modifying. Preserves other MCP servers.
   * 
   * @param agentType - The agent type
   * @returns Promise resolving to the backup path (if created)
   * 
   * @example
   * ```typescript
   * await injector.remove('gemini');
   * ```
   */
  public async remove(agentType: AgentType): Promise<string | null> {
    const configPath = this.getConfigPath(agentType);

    // Check if config exists
    const hasConfig = await this.hasWaaahConfig(agentType);
    if (!hasConfig) {
      return null;
    }

    // Create backup before modifying
    const backupPath = await this.createBackup(configPath);

    // Read existing config
    const existingConfig = await this.readConfig(configPath);

    // Remove WAAAH entry
    if (existingConfig.mcpServers && WAAAH_MCP_NAME in existingConfig.mcpServers) {
      delete existingConfig.mcpServers[WAAAH_MCP_NAME];
    }

    // Write the updated config
    await fs.writeFile(
      configPath,
      JSON.stringify(existingConfig, null, 2),
      'utf-8'
    );

    return backupPath;
  }

  /**
   * Prompts user for MCP server configuration via readline.
   * 
   * Asks for:
   * 1. Server address (default: http://localhost:3456)
   * 2. API key (optional)
   * 
   * @returns Promise resolving to the user's config choices
   * 
   * @example
   * ```typescript
   * const config = await injector.promptForConfig();
   * // User input: server=http://localhost:3456, apiKey=
   * // config = { url: 'http://localhost:3456' }
   * ```
   */
  public async promptForConfig(): Promise<MCPServerConfig> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const question = (prompt: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer);
        });
      });
    };

    try {
      // Prompt for server address
      const urlInput = await question(`WAAAH server address [${DEFAULT_SERVER_URL}]: `);
      const url = urlInput.trim() || DEFAULT_SERVER_URL;

      // Prompt for API key
      const apiKeyInput = await question('API key (optional, press Enter to skip): ');
      const apiKey = apiKeyInput.trim() || undefined;

      return { url, apiKey };
    } finally {
      rl.close();
    }
  }

  /**
   * Gets the current WAAAH config from an agent's config file.
   * 
   * @param agentType - The agent type
   * @returns Promise resolving to the current config, or null if not configured
   * 
   * @example
   * ```typescript
   * const config = await injector.getWaaahConfig('gemini');
   * if (config) {
   *   console.log('Current server:', config.url);
   * }
   * ```
   */
  public async getWaaahConfig(agentType: AgentType): Promise<MCPServerConfig | null> {
    const configPath = this.getConfigPath(agentType);

    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as GeminiMCPConfig | ClaudeMCPConfig;

      const mcpConfig = config.mcpServers?.[WAAAH_MCP_NAME];
      if (!mcpConfig) {
        return null;
      }

      // Extract URL based on config type
      if ('url' in mcpConfig && mcpConfig.url) {
        return {
          url: mcpConfig.url,
          apiKey: mcpConfig.env?.WAAAH_API_KEY,
        };
      }

      // For Claude, extract from args
      if ('args' in mcpConfig && mcpConfig.args) {
        const urlIndex = mcpConfig.args.indexOf('--url');
        const url = urlIndex >= 0 ? mcpConfig.args[urlIndex + 1] : undefined;
        if (url) {
          return {
            url,
            apiKey: mcpConfig.env?.WAAAH_API_KEY,
          };
        }
      }

      return null;
    } catch {
      return null;
    }
  }
}
