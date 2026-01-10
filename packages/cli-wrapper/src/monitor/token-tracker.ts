/**
 * TokenTracker - Agent token usage tracking and reporting
 * 
 * Monitors agent output for token usage patterns and tracks cumulative usage.
 * Supports Gemini CLI output format and provides session summaries.
 * 
 * @packageDocumentation
 */

import { EventEmitter } from 'events';

/**
 * Token usage data for a single request/response.
 */
export interface TokenUsage {
  /** Number of input tokens */
  inputTokens: number;
  /** Number of output tokens */
  outputTokens: number;
  /** Total tokens (input + output) */
  totalTokens: number;
  /** Timestamp of this usage event */
  timestamp: Date;
}

/**
 * Cumulative token usage summary.
 */
export interface TokenSummary {
  /** Total input tokens for session */
  totalInputTokens: number;
  /** Total output tokens for session */
  totalOutputTokens: number;
  /** Combined total tokens */
  totalTokens: number;
  /** Number of request/response cycles */
  requestCount: number;
  /** Session start time */
  sessionStart: Date;
  /** Average tokens per request */
  averageTokensPerRequest: number;
}

/**
 * Token tracker events.
 */
export interface TokenTrackerEvents {
  'usage': (usage: TokenUsage) => void;
  'milestone': (milestone: { tokens: number; type: 'input' | 'output' | 'total' }) => void;
}

/**
 * Patterns for detecting token usage in CLI output.
 */
const TOKEN_PATTERNS = {
  // Gemini CLI patterns
  gemini: [
    // "Input tokens: 1234, Output tokens: 567"
    /Input tokens:\s*(\d+),?\s*Output tokens:\s*(\d+)/i,
    // "Tokens used: 1234 input, 567 output"
    /Tokens used:\s*(\d+)\s*input,?\s*(\d+)\s*output/i,
    // "[1234 tokens] → [567 tokens]"
    /\[(\d+)\s*tokens?\]\s*→\s*\[(\d+)\s*tokens?\]/i,
    // "tokens: 1234/567"
    /tokens:\s*(\d+)\s*\/\s*(\d+)/i,
    // "Usage: input=1234 output=567"
    /Usage:\s*input\s*=\s*(\d+)\s*output\s*=\s*(\d+)/i,
  ],
  // Claude CLI patterns (if available)
  claude: [
    /input_tokens:\s*(\d+)[,\s]+output_tokens:\s*(\d+)/i,
    /tokens\s*\{\s*input:\s*(\d+),?\s*output:\s*(\d+)/i,
  ],
};

/**
 * Token usage milestones for notifications.
 */
const MILESTONES = [1000, 5000, 10000, 25000, 50000, 100000];

/**
 * Tracks token usage from agent output streams.
 * 
 * @example
 * ```typescript
 * const tracker = new TokenTracker('gemini');
 * 
 * tracker.on('usage', (usage) => {
 *   console.log(`Used ${usage.totalTokens} tokens`);
 * });
 * 
 * // Feed output from agent
 * tracker.processOutput('Input tokens: 1234, Output tokens: 567');
 * 
 * // Get session summary
 * const summary = tracker.getSummary();
 * console.log(`Total: ${summary.totalTokens} tokens`);
 * ```
 */
export class TokenTracker extends EventEmitter {
  private agentType: string;
  private usageHistory: TokenUsage[] = [];
  private sessionStart: Date;
  private lastMilestone: { input: number; output: number; total: number } = {
    input: 0,
    output: 0,
    total: 0,
  };

  /**
   * Creates a new token tracker.
   * @param agentType - Type of agent ('gemini', 'claude')
   */
  constructor(agentType: string) {
    super();
    this.agentType = agentType.toLowerCase();
    this.sessionStart = new Date();
  }

  /**
   * Processes agent output and extracts token usage.
   * @param output - Raw output string from agent
   * @returns Token usage if found, null otherwise
   */
  public processOutput(output: string): TokenUsage | null {
    const patterns = this.getPatterns();

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        const inputTokens = parseInt(match[1], 10);
        const outputTokens = parseInt(match[2], 10);

        const usage: TokenUsage = {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          timestamp: new Date(),
        };

        this.recordUsage(usage);
        return usage;
      }
    }

    return null;
  }

  /**
   * Records a token usage event.
   * @param usage - Token usage to record
   */
  private recordUsage(usage: TokenUsage): void {
    this.usageHistory.push(usage);
    this.emit('usage', usage);
    this.checkMilestones();
  }

  /**
   * Checks and emits milestone events.
   */
  private checkMilestones(): void {
    const summary = this.getSummary();

    for (const milestone of MILESTONES) {
      if (summary.totalInputTokens >= milestone && this.lastMilestone.input < milestone) {
        this.lastMilestone.input = milestone;
        this.emit('milestone', { tokens: milestone, type: 'input' });
      }

      if (summary.totalOutputTokens >= milestone && this.lastMilestone.output < milestone) {
        this.lastMilestone.output = milestone;
        this.emit('milestone', { tokens: milestone, type: 'output' });
      }

      if (summary.totalTokens >= milestone && this.lastMilestone.total < milestone) {
        this.lastMilestone.total = milestone;
        this.emit('milestone', { tokens: milestone, type: 'total' });
      }
    }
  }

  /**
   * Gets the regex patterns for the current agent type.
   * @returns Array of regex patterns
   */
  private getPatterns(): RegExp[] {
    if (this.agentType === 'claude') {
      return [...TOKEN_PATTERNS.claude, ...TOKEN_PATTERNS.gemini];
    }
    return [...TOKEN_PATTERNS.gemini, ...TOKEN_PATTERNS.claude];
  }

  /**
   * Gets the cumulative token usage summary.
   * @returns Token summary for the session
   */
  public getSummary(): TokenSummary {
    const totalInputTokens = this.usageHistory.reduce((sum, u) => sum + u.inputTokens, 0);
    const totalOutputTokens = this.usageHistory.reduce((sum, u) => sum + u.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const requestCount = this.usageHistory.length;

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      requestCount,
      sessionStart: this.sessionStart,
      averageTokensPerRequest: requestCount > 0 ? Math.round(totalTokens / requestCount) : 0,
    };
  }

  /**
   * Gets the usage history.
   * @returns Array of token usage events
   */
  public getHistory(): TokenUsage[] {
    return [...this.usageHistory];
  }

  /**
   * Formats the summary for display.
   * @returns Formatted summary string
   */
  public formatSummary(): string {
    const summary = this.getSummary();
    const duration = Date.now() - this.sessionStart.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);

    const lines = [
      '═══════════════════════════════════════',
      '        TOKEN USAGE SUMMARY',
      '═══════════════════════════════════════',
      `  Agent Type:    ${this.agentType}`,
      `  Duration:      ${minutes}m ${seconds}s`,
      `  Requests:      ${summary.requestCount}`,
      '───────────────────────────────────────',
      `  Input Tokens:  ${summary.totalInputTokens.toLocaleString()}`,
      `  Output Tokens: ${summary.totalOutputTokens.toLocaleString()}`,
      `  Total Tokens:  ${summary.totalTokens.toLocaleString()}`,
      '───────────────────────────────────────',
      `  Avg/Request:   ${summary.averageTokensPerRequest.toLocaleString()}`,
      '═══════════════════════════════════════',
    ];

    return lines.join('\n');
  }

  /**
   * Displays the summary to console.
   */
  public displaySummary(): void {
    console.log('\n' + this.formatSummary() + '\n');
  }

  /**
   * Resets the tracker for a new session.
   */
  public reset(): void {
    this.usageHistory = [];
    this.sessionStart = new Date();
    this.lastMilestone = { input: 0, output: 0, total: 0 };
  }

  /**
   * Logs token usage to a file or logger.
   * @param logger - Optional logger instance with info method
   */
  public logUsage(logger?: { info: (msg: string) => void }): void {
    const summary = this.getSummary();
    const message = `Token usage: ${summary.totalTokens} total (${summary.totalInputTokens} in, ${summary.totalOutputTokens} out) over ${summary.requestCount} requests`;

    if (logger) {
      logger.info(message);
    } else {
      console.log(message);
    }
  }
}
