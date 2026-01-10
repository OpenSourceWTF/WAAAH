/**
 * MCPInjector - MCP configuration injection
 * 
 * Detects and injects WAAAH MCP configuration into CLI agent config files.
 * Supports gemini (~/.gemini/settings.json) and claude (~/.claude/claude_desktop_config.json).
 * 
 * @packageDocumentation
 */

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
 * Handles MCP configuration detection and injection.
 * 
 * @example
 * ```typescript
 * const injector = new MCPInjector();
 * const hasConfig = await injector.hasWaaahConfig('gemini');
 * if (!hasConfig) {
 *   await injector.inject('gemini', { url: 'http://localhost:3456' });
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
   */
  public async hasWaaahConfig(agentType: AgentType): Promise<boolean> {
    // TODO: Implement config detection
    void agentType;
    return false;
  }

  /**
   * Injects WAAAH MCP configuration into agent config.
   * @param agentType - The agent type
   * @param config - MCP server configuration
   */
  public async inject(agentType: AgentType, config: MCPServerConfig): Promise<void> {
    // TODO: Implement config injection
    void agentType;
    void config;
    throw new Error('Not implemented');
  }

  /**
   * Removes WAAAH MCP configuration from agent config.
   * @param agentType - The agent type
   */
  public async remove(agentType: AgentType): Promise<void> {
    // TODO: Implement config removal
    void agentType;
    throw new Error('Not implemented');
  }

  /**
   * Prompts user for MCP server configuration.
   * @returns Promise resolving to the user's config choices
   */
  public async promptForConfig(): Promise<MCPServerConfig> {
    // TODO: Implement interactive prompt
    throw new Error('Not implemented');
  }
}
