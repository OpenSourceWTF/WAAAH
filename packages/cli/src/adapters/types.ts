/**
 * CLI Adapter Types
 * 
 * Plugin pattern for supporting multiple coding CLIs (gemini, claude, etc.)
 */

export enum ExitCode {
  SUCCESS = 0,
  CLI_NOT_FOUND = 1,
  AUTH_FAILED = 2,
  WORKFLOW_NOT_FOUND = 3,
  MCP_CONFIG_ERROR = 4,
  AGENT_ERROR = 5,
  UNKNOWN_CLI = 6
}

export interface MCPConfig {
  url: string;
  hasApiKey: boolean;
}

export interface CLIAdapter {
  /** CLI executable name (e.g., 'gemini', 'claude') */
  name: string;

  /** Path to the CLI's config file */
  configPath: string;

  /** Check if CLI is installed */
  checkInstalled(): Promise<boolean>;

  /** Check if CLI is authenticated (if applicable) */
  checkAuth(): Promise<boolean>;

  /** Get current WAAAH MCP config from CLI's settings */
  getMcpConfig(): MCPConfig | null;

  /** Write/update WAAAH MCP config to CLI's settings */
  writeMcpConfig(serverUrl: string, apiKey: string): void;

  /** Build command-line arguments for executing the CLI */
  buildArgs(workflow: string, resume: boolean): string[];
}
