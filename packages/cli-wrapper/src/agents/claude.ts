import { BaseAgent, AgentConfig } from './base.js';

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
 */
export class ClaudeAgent extends BaseAgent {
  private sessionId: string | undefined;

  constructor(config: AgentConfig) {
    super(config);
  }

  protected getCliCommand(): string {
    return 'claude';
  }

  protected getCliArgs(): string[] {
    const args = ['--dangerously-skip-permissions'];

    if (this.sessionId) {
      args.push('--resume', this.sessionId);
    } else {
      const prompt = this.config.resume
        ? `Resume the /${this.config.workflow} workflow. Continue from where you left off.`
        : `Follow the /${this.config.workflow} workflow exactly.`;
      args.push(prompt);
      
      // Initialize sessionId for next restart
      this.sessionId = `waaah-${Date.now()}`;
    }

    return args;
  }

  protected getAuthPatterns(): RegExp[] {
    return AUTH_REQUIRED_PATTERNS;
  }

  public getAuthInstructions(): string {
    return `
To authenticate Claude CLI:
  1. Run: claude login
  2. Follow the prompts
  3. Or set ANTHROPIC_API_KEY environment variable
`.trim();
  }

  public getInstallInstructions(): string {
    return `
To install Claude CLI:
  1. Run: npm install -g @anthropic-ai/claude-code
`.trim();
  }
}

