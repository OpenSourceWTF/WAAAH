/**
 * LoopDetector - Agent loop exit detection
 * 
 * Monitors agent output to detect when the agent exits the main processing loop.
 * Triggers automatic restart when loop exit is detected.
 * 
 * @packageDocumentation
 */

/**
 * Loop detection result.
 */
export interface LoopDetectionResult {
  /** Whether a loop exit was detected */
  exitDetected: boolean;
  /** Reason for the detection (if any) */
  reason?: string;
  /** Confidence level (0-1) */
  confidence: number;
}

/**
 * Callback for loop exit events.
 */
export type LoopExitCallback = (result: LoopDetectionResult) => void;

/**
 * Monitors agent output for loop exit conditions.
 * 
 * @example
 * ```typescript
 * const detector = new LoopDetector();
 * detector.onLoopExit((result) => {
 *   if (result.exitDetected) {
 *     console.log('Loop exit detected:', result.reason);
 *   }
 * });
 * detector.analyze('agent output here...');
 * ```
 */
export class LoopDetector {
  private callbacks: LoopExitCallback[] = [];
  private lastActivityTime: Date = new Date();
  private inactivityThresholdMs: number = 120000; // 2 minutes

  /**
   * Creates a new loop detector.
   * @param inactivityThresholdMs - Inactivity threshold in milliseconds (default: 2 minutes)
   */
  constructor(inactivityThresholdMs?: number) {
    if (inactivityThresholdMs !== undefined) {
      this.inactivityThresholdMs = inactivityThresholdMs;
    }
  }

  /**
   * Analyzes output for loop exit patterns.
   * @param output - Agent output to analyze
   * @returns Detection result
   */
  public analyze(output: string): LoopDetectionResult {
    // TODO: Implement pattern detection
    // Patterns to detect:
    // - Agent saying it's done/exiting
    // - wait_for_prompt timeout without restart
    // - Error messages indicating crash
    void output;
    this.lastActivityTime = new Date();
    return {
      exitDetected: false,
      confidence: 0,
    };
  }

  /**
   * Checks for inactivity-based loop exit.
   * @returns Detection result based on inactivity
   */
  public checkInactivity(): LoopDetectionResult {
    const now = new Date();
    const elapsed = now.getTime() - this.lastActivityTime.getTime();

    if (elapsed > this.inactivityThresholdMs) {
      return {
        exitDetected: true,
        reason: `No activity for ${Math.floor(elapsed / 1000)} seconds`,
        confidence: 0.8,
      };
    }

    return {
      exitDetected: false,
      confidence: 0,
    };
  }

  /**
   * Registers a callback for loop exit events.
   * @param callback - Callback function
   */
  public onLoopExit(callback: LoopExitCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Resets the detector state.
   */
  public reset(): void {
    this.lastActivityTime = new Date();
  }

  /**
   * Starts the inactivity monitor.
   * @param intervalMs - Check interval in milliseconds (default: 30 seconds)
   * @returns Interval ID for stopping
   */
  public startMonitor(intervalMs: number = 30000): NodeJS.Timeout {
    return setInterval(() => {
      const result = this.checkInactivity();
      if (result.exitDetected) {
        this.callbacks.forEach((cb) => cb(result));
      }
    }, intervalMs);
  }
}
