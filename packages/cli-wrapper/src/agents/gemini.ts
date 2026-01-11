/**
 * GeminiAgent - Gemini CLI agent implementation
 * 
 * Manages spawning and controlling the Gemini CLI with WAAAH MCP integration.
 * 
 * @packageDocumentation
 */

import { BaseAgent, AgentConfig } from './base.js';

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
 */
export class GeminiAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
  }

  protected getCliCommand(): string {
    return 'gemini';
  }

  protected getCliArgs(): string[] {
    const prompt = this.config.resume
      ? `Resume the /${this.config.workflow} workflow. Continue from where you left off.`
      : `Follow the /${this.config.workflow} workflow exactly.`;

    return ['-i', prompt, '--yolo'];
  }

  protected getAuthPatterns(): RegExp[] {
    return AUTH_REQUIRED_PATTERNS;
  }

  public getAuthInstructions(): string {
    return `
To authenticate Gemini CLI:
  1. Run: gemini auth login
  2. Follow the browser prompts
  3. Once complete, try running your command again
`.trim();
  }

  public getInstallInstructions(): string {
    return `
To install Gemini CLI:
  1. Visit: https://github.com/google/gemini-cli
  2. Follow installation instructions for your platform
`.trim();
  }
}
