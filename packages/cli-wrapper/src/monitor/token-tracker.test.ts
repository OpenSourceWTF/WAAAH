/**
 * TokenTracker Tests
 * 
 * Tests for parsing and tracking token usage from agent output.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TokenTracker, TokenUsage } from './token-tracker.js';

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker('gemini');
  });

  describe('token parsing', () => {
    it('should parse gemini token usage from output', () => {
      // Gemini CLI outputs token info in format: "Input tokens: X, Output tokens: Y"
      const output = 'Response complete. Input tokens: 1234, Output tokens: 5678';

      const result = tracker.processOutput(output);

      expect(result).not.toBeNull();
      expect(result?.inputTokens).toBe(1234);
      expect(result?.outputTokens).toBe(5678);
    });

    it('should handle alternative token format', () => {
      // Alternative format: "Tokens used: 100 input, 200 output"
      const output = 'Tokens used: 100 input, 200 output';

      const result = tracker.processOutput(output);

      expect(result).not.toBeNull();
      expect(result?.inputTokens).toBe(100);
      expect(result?.outputTokens).toBe(200);
    });

    it('should accumulate tokens across multiple outputs', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      tracker.processOutput('Input tokens: 50, Output tokens: 100');

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(150);
      expect(summary.totalOutputTokens).toBe(300);
      expect(summary.totalTokens).toBe(450);
    });

    it('should not count non-token output', () => {
      const result = tracker.processOutput('This is regular output with no token info');

      expect(result).toBeNull();

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
    });

    it('should handle tokens: X/Y format', () => {
      const output = 'tokens: 1234/5678';

      const result = tracker.processOutput(output);

      expect(result).not.toBeNull();
      expect(result?.inputTokens).toBe(1234);
      expect(result?.outputTokens).toBe(5678);
    });
  });

  describe('usage tracking', () => {
    it('should track cumulative tokens per session', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      expect(tracker.getSummary().totalTokens).toBe(300);

      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      expect(tracker.getSummary().totalTokens).toBe(600);
    });

    it('should track number of requests', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      tracker.processOutput('Input tokens: 100, Output tokens: 200');

      const summary = tracker.getSummary();
      expect(summary.requestCount).toBe(2);
    });

    it('should provide average tokens per request', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      tracker.processOutput('Input tokens: 200, Output tokens: 400');

      const summary = tracker.getSummary();
      expect(summary.averageTokensPerRequest).toBe(450); // (300 + 600) / 2
    });
  });

  describe('events', () => {
    it('should emit usage events', () => {
      const usageHandler = vi.fn();
      tracker.on('usage', usageHandler);

      tracker.processOutput('Input tokens: 100, Output tokens: 200');

      expect(usageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          inputTokens: 100,
          outputTokens: 200,
        })
      );
    });

    it('should emit milestone events', () => {
      const milestoneHandler = vi.fn();
      tracker.on('milestone', milestoneHandler);

      // Generate enough tokens to hit 1000 milestone
      tracker.processOutput('Input tokens: 600, Output tokens: 500');

      expect(milestoneHandler).toHaveBeenCalledWith(
        expect.objectContaining({ tokens: 1000, type: 'total' })
      );
    });
  });

  describe('summary', () => {
    it('should generate formatted summary', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      tracker.processOutput('Input tokens: 200, Output tokens: 400');

      const summary = tracker.formatSummary();

      expect(summary).toContain('300'); // total input
      expect(summary).toContain('600'); // total output
      expect(summary).toContain('900'); // total
      expect(summary).toContain('2'); // requests
    });

    it('should handle empty session gracefully', () => {
      const summary = tracker.getSummary();

      expect(summary.totalTokens).toBe(0);
      expect(summary.requestCount).toBe(0);
    });
  });

  describe('history', () => {
    it('should maintain usage history', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      tracker.processOutput('Input tokens: 50, Output tokens: 100');

      const history = tracker.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].inputTokens).toBe(100);
      expect(history[1].inputTokens).toBe(50);
    });
  });

  describe('reset', () => {
    it('should reset all counters', () => {
      tracker.processOutput('Input tokens: 100, Output tokens: 200');
      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.requestCount).toBe(0);
    });
  });

  describe('claude support', () => {
    it('should parse claude token format', () => {
      const claudeTracker = new TokenTracker('claude');
      const output = 'input_tokens: 100, output_tokens: 200';

      const result = claudeTracker.processOutput(output);

      expect(result).not.toBeNull();
      expect(result?.inputTokens).toBe(100);
      expect(result?.outputTokens).toBe(200);
    });
  });
});
