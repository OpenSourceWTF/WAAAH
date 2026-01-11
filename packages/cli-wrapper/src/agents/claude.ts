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

  protected setupPtyHandlers(): void {
    super.setupPtyHandlers();

    this.ptyManager?.onData((data) => {
      // Look for session ID in Claude's output
      // Pattern: Session ID: <id>
      const match = data.match(/Session ID: ([a-zA-Z0-9_-]+)/i);
      if (match?.[1]) {
        this.sessionId = match[1];
      }
    });
  }

  protected getCliCommand(): string {
    return 'claude';
  }

  protected getCliArgs(): string[] {
    // Always start fresh - resume feature disabled (not working reliably)
    const prompt = `Follow the /${this.config.workflow} workflow exactly.`;
    return ['--dangerously-skip-permissions', prompt];
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

