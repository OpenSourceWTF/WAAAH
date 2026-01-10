/**
 * MCP Config Scanner
 * 
 * Scans CLI config files to detect existing WAAAH MCP configuration.
 * Supports both Gemini CLI (~/.gemini/settings.json) and Claude CLI
 * (~/.claude/claude_desktop_config.json) formats.
 * 
 * @packageDocumentation
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Common MCP server configuration fields.
 */
export interface MCPConfig {
  /** The server name (e.g., 'waaah') */
  name: string;
  /** Command to execute (for stdio transport) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** HTTP URL (for HTTP transport, Gemini-specific) */
  httpUrl?: string;
  /** HTTP headers (for HTTP transport) */
  headers?: Record<string, string>;
}

/**
 * Gemini CLI MCP server configuration format.
 * 
 * Gemini supports two transport types:
 * 1. STDIO: Uses `command` and `args` to spawn a subprocess
 * 2. HTTP: Uses `httpUrl` and optional `headers` for HTTP transport
 */
export interface GeminiMCPServerConfig {
  /** Command to execute (STDIO transport) */
  command?: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** HTTP URL (HTTP transport) */
  httpUrl?: string;
  /** HTTP headers */
  headers?: Record<string, string>;
}

/**
 * Gemini CLI settings.json format.
 */
interface GeminiSettings {
  mcpServers?: Record<string, GeminiMCPServerConfig>;
  [key: string]: unknown;
}

/**
 * Claude CLI MCP server configuration format.
 * 
 * Claude uses STDIO transport with command and args.
 */
export interface ClaudeMCPServerConfig {
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Claude CLI claude_desktop_config.json format.
 */
interface ClaudeConfig {
  mcpServers?: Record<string, ClaudeMCPServerConfig>;
  [key: string]: unknown;
}

/** Supported agent types */
export type AgentType = 'gemini' | 'claude';

/** The MCP server name we look for */
const WAAAH_SERVER_NAME = 'waaah';

/**
 * Gets the default config file path for an agent type.
 * 
 * @param agentType - The CLI agent type
 * @returns The default config file path
 * 
 * @example
 * ```typescript
 * const geminiPath = getDefaultConfigPath('gemini');
 * // Returns: /home/user/.gemini/settings.json
 * ```
 */
export function getDefaultConfigPath(agentType: AgentType): string {
  const home = os.homedir();
  switch (agentType) {
    case 'gemini':
      return path.join(home, '.gemini', 'settings.json');
    case 'claude':
      return path.join(home, '.claude', 'claude_desktop_config.json');
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

/**
 * Scans a config file for WAAAH MCP configuration.
 * 
 * This is the main entry point for scanning MCP configs. It reads the
 * specified config file and looks for a 'waaah' MCP server entry.
 * 
 * @param configPath - Path to the config file to scan
 * @param agentType - The CLI agent type (determines parsing format)
 * @returns The WAAAH MCP config if found, null otherwise
 * 
 * @example
 * ```typescript
 * const config = scanMCPConfig('~/.gemini/settings.json', 'gemini');
 * if (config) {
 *   console.log('WAAAH MCP is configured:', config);
 * }
 * ```
 */
export function scanMCPConfig(configPath: string, agentType: AgentType): MCPConfig | null {
  try {
    // Check if file exists
    if (!fs.existsSync(configPath)) {
      return null;
    }

    // Read and parse the config file
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    // Extract MCP servers based on agent type
    const mcpServers = config.mcpServers;
    if (!mcpServers || typeof mcpServers !== 'object') {
      return null;
    }

    // Look for WAAAH server
    const waaahConfig = mcpServers[WAAAH_SERVER_NAME];
    if (!waaahConfig) {
      return null;
    }

    // Convert to our common format based on agent type
    if (agentType === 'gemini') {
      return convertGeminiConfig(waaahConfig as GeminiMCPServerConfig);
    } else {
      return convertClaudeConfig(waaahConfig as ClaudeMCPServerConfig);
    }
  } catch {
    // Handle JSON parse errors, file read errors, etc.
    return null;
  }
}

/**
 * Scans the Gemini CLI config for WAAAH MCP.
 * 
 * Uses the default Gemini config path (~/.gemini/settings.json).
 * 
 * @returns The WAAAH MCP config if found, null otherwise
 * 
 * @example
 * ```typescript
 * const config = scanGeminiConfig();
 * if (config) {
 *   console.log('Found WAAAH in Gemini config');
 * }
 * ```
 */
export function scanGeminiConfig(): MCPConfig | null {
  const configPath = getDefaultConfigPath('gemini');
  return scanMCPConfig(configPath, 'gemini');
}

/**
 * Scans the Claude CLI config for WAAAH MCP.
 * 
 * Uses the default Claude config path (~/.claude/claude_desktop_config.json).
 * 
 * @returns The WAAAH MCP config if found, null otherwise
 * 
 * @example
 * ```typescript
 * const config = scanClaudeConfig();
 * if (config) {
 *   console.log('Found WAAAH in Claude config');
 * }
 * ```
 */
export function scanClaudeConfig(): MCPConfig | null {
  const configPath = getDefaultConfigPath('claude');
  return scanMCPConfig(configPath, 'claude');
}

/**
 * Converts Gemini-specific config to common MCPConfig format.
 * 
 * @param geminiConfig - The Gemini MCP server config
 * @returns Common MCPConfig format
 */
function convertGeminiConfig(geminiConfig: GeminiMCPServerConfig): MCPConfig {
  return {
    name: WAAAH_SERVER_NAME,
    command: geminiConfig.command,
    args: geminiConfig.args,
    env: geminiConfig.env,
    httpUrl: geminiConfig.httpUrl,
    headers: geminiConfig.headers,
  };
}

/**
 * Converts Claude-specific config to common MCPConfig format.
 * 
 * @param claudeConfig - The Claude MCP server config
 * @returns Common MCPConfig format
 */
function convertClaudeConfig(claudeConfig: ClaudeMCPServerConfig): MCPConfig {
  return {
    name: WAAAH_SERVER_NAME,
    command: claudeConfig.command,
    args: claudeConfig.args,
    env: claudeConfig.env,
  };
}

/**
 * Scans all known CLI configs for WAAAH MCP.
 * 
 * Checks both Gemini and Claude default config locations.
 * 
 * @returns An object with configs for each agent type, or null if not found
 * 
 * @example
 * ```typescript
 * const configs = scanAllConfigs();
 * if (configs.gemini) {
 *   console.log('Found in Gemini');
 * }
 * if (configs.claude) {
 *   console.log('Found in Claude');
 * }
 * ```
 */
export function scanAllConfigs(): { gemini: MCPConfig | null; claude: MCPConfig | null } {
  return {
    gemini: scanGeminiConfig(),
    claude: scanClaudeConfig(),
  };
}
