/**
 * ClaudeAgent - Claude CLI agent implementation
 * 
 * Manages spawning and controlling the Claude CLI with WAAAH MCP integration.
 * 
 * @packageDocumentation
 */

import { execSync } from 'child_process';
import { BaseAgent, AgentConfig } from './base.js';

/**
 * Authentication status result.
 */
export interface AuthStatus {
  /** Whether the CLI is authenticated */
  authenticated: boolean;
  /** Error message if not authenticated */
  error?: string;
  /** Instructions for authenticating */
  instructions?: string;
}

/**
 * Patterns that indicate Claude requires authentication.
 */
const AUTH_REQUIRED_PATTERNS = [
  /please log in/i,
  /authentication required/i,
  /not authenticated/i,
  /need to authenticate/i,
  /sign in to continue/i,
  /run `?claude login`?/i,
  /claude login/i,
  /api key required/i,
  /invalid api key/i,
  /unauthorized/i,
];

/**
 * ClaudeAgent - Implementation for the Claude CLI.
 * 
 * @example
 * ```typescript
 * const agent = new ClaudeAgent({
 *   workflow: 'waaah-orc',
 *   workspaceRoot: '/path/to/project',
 * });
 * 
 * if (await agent.checkInstalled()) {
 *   const authStatus = await agent.checkAuth();
 *   if (authStatus.authenticated) {
 *     await agent.start();
 *   } else {
 *     console.error(authStatus.error);
 *     console.log(authStatus.instructions);
 *   }
 * }
 * ```
 */
export class ClaudeAgent extends BaseAgent {
  /**
   * Creates a new ClaudeAgent instance.
   * @param config - Agent configuration options
   */
  constructor(config: AgentConfig) {
    super(config);
  }

  /**
   * Returns the CLI command to spawn.
   * @returns The Claude CLI executable name
   */
  protected getCliCommand(): string {
    return 'claude';
  }

  /**
   * Returns the arguments to pass to the Claude CLI.
   * @returns Array of CLI arguments
   */
  protected getCliArgs(): string[] {
    const prompt = this.config.resume
      ? `Resume the /${this.config.workflow} workflow. Continue from where you left off.`
      : `Follow the /${this.config.workflow} workflow exactly.`;

    // Claude CLI: claude [options] [prompt]
    // Use --dangerously-skip-permissions for autonomous operation (like gemini's --yolo)
    return [
      '--dangerously-skip-permissions',
      prompt
    ];
  }

  /**
   * Checks if the Claude CLI is installed and accessible.
   * @returns Promise resolving to true if CLI is available
   */
  public async checkInstalled(): Promise<boolean> {
    try {
      execSync('which claude', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if the Claude CLI is authenticated/logged in.
   * @returns Promise resolving to true if authenticated
   */
  public async checkAuthenticated(): Promise<boolean> {
    const status = await this.checkAuth();
    return status.authenticated;
  }

  /**
   * Performs detailed authentication check for Claude CLI.
   * 
   * Attempts to run a simple command and parses output for auth errors.
   * 
   * @returns Promise resolving to AuthStatus with details
   * @example
   * ```typescript
   * const status = await agent.checkAuth();
   * if (!status.authenticated) {
   *   console.error(status.error);
   *   console.log(status.instructions);
   * }
   * ```
   */
  public async checkAuth(): Promise<AuthStatus> {
    try {
      // Try running claude with --version to check auth status
      const output = execSync('claude --version 2>&1', {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });

      // Check output for auth-required patterns
      if (this.requiresAuth(output)) {
        return {
          authenticated: false,
          error: '❌ Claude CLI requires authentication.',
          instructions: this.getAuthInstructions(),
        };
      }

      // If we got version info without auth errors, we're good
      return { authenticated: true };
    } catch (error) {
      // Command failed - check the error output
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.requiresAuth(errorMessage)) {
        return {
          authenticated: false,
          error: '❌ Claude CLI requires authentication.',
          instructions: this.getAuthInstructions(),
        };
      }

      // Check if it's a "command not found" error
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        return {
          authenticated: false,
          error: '❌ Claude CLI not found.',
          instructions: this.getInstallInstructions(),
        };
      }

      // Unknown error - assume not authenticated
      return {
        authenticated: false,
        error: `❌ Failed to check Claude auth: ${errorMessage}`,
        instructions: this.getAuthInstructions(),
      };
    }
  }

  /**
   * Checks if output indicates authentication is required.
   * @param output - Command output to check
   * @returns True if auth is required
   */
  public requiresAuth(output: string): boolean {
    return AUTH_REQUIRED_PATTERNS.some(pattern => pattern.test(output));
  }

  /**
   * Returns authentication instructions for Claude CLI.
   * @returns Multi-line instruction string
   */
  public getAuthInstructions(): string {
    return `
To authenticate Claude CLI:
  1. Run: claude login
  2. Follow the prompts to sign in with your Anthropic account
  3. Or set ANTHROPIC_API_KEY environment variable
  4. Once complete, try running your command again

For more info: https://docs.anthropic.com/en/docs/claude-code/cli
`.trim();
  }

  /**
   * Returns installation instructions for Claude CLI.
   * @returns Multi-line instruction string
   */
  public getInstallInstructions(): string {
    return `
To install Claude CLI:
  1. Run: npm install -g @anthropic-ai/claude-code
  2. Then authenticate: claude login
  
Alternatively, set ANTHROPIC_API_KEY environment variable.

For more info: https://docs.anthropic.com/en/docs/claude-code/cli
`.trim();
  }

  /**
   * Returns the claude-specific config path.
   * @returns Path to the claude config file
   */
  public getConfigPath(): string {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return `${home}/.claude/claude_desktop_config.json`;
  }
}
