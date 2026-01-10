/**
 * BaseAgent - Abstract base class for CLI agent implementations
 * 
 * Defines the common interface for spawning and managing external CLI coding agents.
 * 
 * @packageDocumentation
 */

/**
 * Configuration options for agent initialization.
 */
export interface AgentConfig {
  /** The workflow to execute (e.g., 'waaah-orc') */
  workflow: string;
  /** Whether to resume a previous session */
  resume?: boolean;
  /** Path to the workspace root */
  workspaceRoot: string;
}

/**
 * Abstract base class for CLI agent implementations.
 * 
 * @example
 * ```typescript
 * class GeminiAgent extends BaseAgent {
 *   protected getCliCommand(): string {
 *     return 'gemini';
 *   }
 * }
 * ```
 */
export abstract class BaseAgent {
  protected config: AgentConfig;

  /**
   * Creates a new agent instance.
   * @param config - Agent configuration options
   */
  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Returns the CLI command to spawn.
   * @returns The CLI executable name or path
   */
  protected abstract getCliCommand(): string;

  /**
   * Returns the arguments to pass to the CLI.
   * @returns Array of CLI arguments
   */
  protected abstract getCliArgs(): string[];

  /**
   * Checks if the CLI is installed and accessible.
   * @returns Promise resolving to true if CLI is available
   * @throws Error if CLI is not found
   */
  public abstract checkInstalled(): Promise<boolean>;

  /**
   * Checks if the CLI is authenticated/logged in.
   * @returns Promise resolving to true if authenticated
   */
  public abstract checkAuthenticated(): Promise<boolean>;

  /**
   * Starts the agent with the configured workflow.
   * @returns Promise that resolves when the agent exits
   */
  public async start(): Promise<void> {
    // TODO: Implement agent startup
    throw new Error('Not implemented');
  }

  /**
   * Sends a prompt/message to the running agent.
   * @param prompt - The prompt text to send
   */
  public async sendPrompt(prompt: string): Promise<void> {
    // TODO: Implement prompt sending via PTY
    void prompt;
    throw new Error('Not implemented');
  }

  /**
   * Gracefully stops the agent.
   */
  public async stop(): Promise<void> {
    // TODO: Implement graceful shutdown
    throw new Error('Not implemented');
  }
}
