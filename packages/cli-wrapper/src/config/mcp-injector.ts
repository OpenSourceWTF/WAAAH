/**
 * MCPInjector - MCP setup injection
 *
 * Detects and injects WAAAH MCP setup into CLI agent settings files.
 * Supports gemini (~/.gemini/settings.json) and claude (~/.claude/claude_desktop_config.json).
 *
 * @packageDocumentation
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { promptProxyMethod } from '../utils/prompts.js';

/** WAAAH MCP server name used in settings files */
const WAAAH_MCP_NAME = 'waaah';

/** Default server address */
const DEFAULT_SERVER_URL = 'http://localhost:3000';

/**
 * MCP server setup.
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
 * Gemini settings.json setup to MCP servers.
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
 * Claude setup structure to MCP servers.
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
 * Handles MCP setup detection and injection.
 *
 * This class manages the process of WAAAH MCP setup in CLI agent
 * settings files. It provides backup, merge, and interactive prompting.
 */
export class MCPInjector {
  /**
   * Gets the settings file path.
   * @param agentType - The agent type
   * @returns Path to the settings file
   */
  public getConfigPath(agentType: AgentType): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const paths: Record<AgentType, string> = {
      gemini: `${home}/.gemini/settings.json`,
      claude: `${home}/.claude/claude_desktop_config.json`,
    };

    return paths[agentType] || (() => { throw new Error(`Unknown: ${agentType}`); })();
  }

  /**
   * Checks WAAAH MCP.
   */
  public async hasWaaahConfig(agentType: AgentType): Promise<boolean> {
    try {
      const config = await this.readConfig(this.getConfigPath(agentType));
      return !!config.mcpServers?.[WAAAH_MCP_NAME];
    } catch {
      return false;
    }
  }

  private async createBackup(configPath: string): Promise<string | null> {
    try {
      await fs.access(configPath);
      const backupPath = `${configPath}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
      await fs.copyFile(configPath, backupPath);
      return backupPath;
    } catch {
      return null;
    }
  }

  private async readConfig(configPath: string): Promise<any> {
    try {
      return JSON.parse(await fs.readFile(configPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private async ensureDir(configPath: string): Promise<void> {
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Injects WAAAH MCP setup.
   */
  public async inject(
    agentType: AgentType,
    config: MCPServerConfig,
    proxyMethod: 'global' | 'npx' = 'global'
  ): Promise<string | null> {
    const configPath = this.getConfigPath(agentType);
    const backupPath = await this.createBackup(configPath);
    const existingConfig = await this.readConfig(configPath);

    existingConfig.mcpServers = existingConfig.mcpServers || {};
    existingConfig.mcpServers[WAAAH_MCP_NAME] = this.createMcpEntry(config, proxyMethod);

    await this.ensureDir(configPath);
    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');

    return backupPath;
  }

  private createMcpEntry(config: MCPServerConfig, proxyMethod: 'global' | 'npx') {
    const isGlobal = proxyMethod === 'global';
    return {
      command: isGlobal ? 'waaah-proxy' : 'npx',
      args: isGlobal ? ['--url', config.url] : ['-y', '@opensourcewtf/waaah-mcp-proxy', '--url', config.url],
      ...(config.apiKey && { env: { WAAAH_API_KEY: config.apiKey } })
    };
  }

  /**
   * Removes WAAAH MCP.
   */
  public async remove(agentType: AgentType): Promise<string | null> {
    const configPath = this.getConfigPath(agentType);
    const hasConfig = await this.hasWaaahConfig(agentType);
    if (!hasConfig) return null;

    const backupPath = await this.createBackup(configPath);
    const existingConfig = await this.readConfig(configPath);

    existingConfig.mcpServers && delete existingConfig.mcpServers[WAAAH_MCP_NAME];

    await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf-8');
    return backupPath;
  }

  /**
   * Prompts user.
   */
  public async promptForConfig(): Promise<MCPServerConfig> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (p: string) => new Promise<string>(r => rl.question(p, r));

    try {
      const url = (await question(`Address [${DEFAULT_SERVER_URL}]: `)).trim() || DEFAULT_SERVER_URL;
      const apiKey = (await question('Key (optional): ')).trim() || undefined;
      return { url, apiKey };
    } finally {
      rl.close();
    }
  }

  /**
   * Gets current WAAAH setup.
   */
  public async getWaaahConfig(agentType: AgentType): Promise<MCPServerConfig | null> {
    try {
      const config = await this.readConfig(this.getConfigPath(agentType));
      const mcpConfig = config.mcpServers?.[WAAAH_MCP_NAME];
      if (!mcpConfig) return null;

      const url = this.extractUrl(mcpConfig);
      return url ? { url, apiKey: mcpConfig.env?.WAAAH_API_KEY } : null;
    } catch {
      return null;
    }
  }

  private extractUrl(mcpConfig: any): string | null {
    if (mcpConfig.url) return mcpConfig.url;
    const args = mcpConfig.args || [];
    const idx = args.indexOf('--url');
    return idx >= 0 ? args[idx + 1] : null;
  }

  /**
   * Configure MCP.
   */
  public async configureInteractive(
    agentType: AgentType,
    serverUrl: string
  ): Promise<void> {
    const method = await promptProxyMethod();
    console.log(`
   Setup WAAAH MCP...`);
    await this.inject(agentType, { url: serverUrl }, method);
    console.log('   ✅ Done.');
  }
}