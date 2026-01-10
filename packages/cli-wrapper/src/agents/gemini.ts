/**
 * GeminiAgent - Gemini CLI agent implementation
 * 
 * Manages spawning and controlling the Gemini CLI with WAAAH MCP integration.
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
 * Patterns that indicate Gemini requires authentication.
 */
const AUTH_REQUIRED_PATTERNS = [
  /run gemini auth/i,
  /not authenticated/i,
  /please log in/i,
  /authentication required/i,
  /need to authenticate/i,
  /sign in to continue/i,
  /run `gemini auth`/i,
  /gemini auth login/i,
];

/**
 * GeminiAgent - Implementation for the Gemini CLI.
 * 
 * @example
 * ```typescript
 * const agent = new GeminiAgent({
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
export class GeminiAgent extends BaseAgent {
  /**
   * Creates a new GeminiAgent instance.
   * @param config - Agent configuration options
   */
  constructor(config: AgentConfig) {
    super(config);
  }

  /**
   * Returns the CLI command to spawn.
   * @returns The Gemini CLI executable name
   */
  protected getCliCommand(): string {
    return 'gemini';
  }

  /**
   * Returns the arguments to pass to the Gemini CLI.
   * @returns Array of CLI arguments including prompt and workspace
   */
  protected getCliArgs(): string[] {
    const prompt = this.config.resume
      ? `Resume the /${this.config.workflow} workflow. Continue from where you left off.`
      : `Follow the /${this.config.workflow} workflow exactly.`;

    // Use --prompt-interactive (-i) for interactive mode
    // Workspace is set via cwd in PTYManager, not as positional argument
    // Format: gemini -i "prompt" --yolo
    return ['-i', prompt, '--yolo'];
  }

  /**
   * Checks if the Gemini CLI is installed and accessible.
   * @returns Promise resolving to true if CLI is available
   * @throws Error if CLI is not found
   */
  public async checkInstalled(): Promise<boolean> {
    try {
      execSync('which gemini', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if the Gemini CLI is authenticated/logged in.
   * @returns Promise resolving to true if authenticated
   */
  public async checkAuthenticated(): Promise<boolean> {
    const status = await this.checkAuth();
    return status.authenticated;
  }

  /**
   * Performs detailed authentication check for Gemini CLI.
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
      // Try running gemini with --version to check auth status
      // If not authenticated, gemini typically outputs an error
      const output = execSync('gemini --version 2>&1', {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });

      // Check output for auth-required patterns
      if (this.requiresAuth(output)) {
        return {
          authenticated: false,
          error: '❌ Gemini CLI requires authentication.',
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
          error: '❌ Gemini CLI requires authentication.',
          instructions: this.getAuthInstructions(),
        };
      }

      // Check if it's a "command not found" error
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        return {
          authenticated: false,
          error: '❌ Gemini CLI not found.',
          instructions: this.getInstallInstructions(),
        };
      }

      // Unknown error - assume not authenticated
      return {
        authenticated: false,
        error: `❌ Failed to check Gemini auth: ${errorMessage}`,
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
   * Returns authentication instructions for Gemini CLI.
   * @returns Multi-line instruction string
   */
  public getAuthInstructions(): string {
    return `
To authenticate Gemini CLI:
  1. Run: gemini auth
  2. Follow the browser prompts to sign in with your Google account
  3. Once complete, try running your command again

For more info: https://github.com/google/generative-ai-docs
`.trim();
  }

  /**
   * Returns installation instructions for Gemini CLI.
   * @returns Multi-line instruction string
   */
  public getInstallInstructions(): string {
    return `
To install Gemini CLI:
  1. Run: npm install -g @google/gemini-cli
  2. Then authenticate: gemini auth

For more info: https://github.com/google/generative-ai-docs
`.trim();
  }
}
