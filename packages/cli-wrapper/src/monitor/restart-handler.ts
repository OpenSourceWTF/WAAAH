/**
 * RestartHandler - Automatic agent restart on loop exit or crash
 * 
 * Manages the restart lifecycle for CLI agents, including exponential
 * backoff for repeated crashes and graceful shutdown handling.
 * 
 * @packageDocumentation
 */

import { LoopDetector, LoopDetectionResult } from './loop-detector.js';

/** Default initial backoff delay in milliseconds */
const DEFAULT_INITIAL_BACKOFF_MS = 1000;

/** Default maximum backoff delay in milliseconds */
const DEFAULT_MAX_BACKOFF_MS = 60000;

/** Default backoff multiplier */
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/** Default maximum restart attempts before giving up */
const DEFAULT_MAX_RESTART_ATTEMPTS = 10;

/**
 * Restart event types.
 */
export type RestartEventType = 'loop-exit' | 'crash' | 'inactivity' | 'manual';

/**
 * Restart event emitted when the handler initiates a restart.
 */
export interface RestartEvent {
  /** Type of restart trigger */
  type: RestartEventType;
  /** Restart attempt number */
  attempt: number;
  /** Delay before restart in milliseconds */
  delayMs: number;
  /** Reason for the restart */
  reason?: string;
  /** Exit code if available */
  exitCode?: number;
}

/**
 * Options for configuring the restart handler.
 */
export interface RestartHandlerOptions {
  /** Initial backoff delay in milliseconds (default: 1000) */
  initialBackoffMs?: number;
  /** Maximum backoff delay in milliseconds (default: 60000) */
  maxBackoffMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Maximum restart attempts before stopping (default: 10) */
  maxRestartAttempts?: number;
  /** Callback for logging events */
  onLog?: (message: string) => void;
  /** Callback for restart events */
  onRestart?: (event: RestartEvent) => void;
  /** Callback when max restarts exceeded */
  onMaxRestartsExceeded?: (attempts: number) => void;
}

/**
 * Handles automatic restart of CLI agents on loop exit or crash.
 * 
 * Implements exponential backoff to prevent rapid restart loops.
 * Integrates with LoopDetector for monitoring agent output.
 * 
 * @example
 * ```typescript
 * const handler = new RestartHandler({
 *   onLog: console.log,
 *   onRestart: async (event) => {
 *     console.log(`Restarting (attempt ${event.attempt})`);
 *     await agent.kill();
 *     await sleep(event.delayMs);
 *     await agent.spawn();
 *   }
 * });
 * 
 * handler.attachToAgent(agent, loopDetector);
 * ```
 */
export class RestartHandler {
  private options: Required<RestartHandlerOptions>;
  private restartCount = 0;
  private lastRestartTime: Date | null = null;
  private isRestarting = false;
  private stopped = false;

  /**
   * Creates a new RestartHandler.
   * @param options - Configuration options
   */
  constructor(options: RestartHandlerOptions = {}) {
    this.options = {
      initialBackoffMs: options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS,
      maxBackoffMs: options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
      backoffMultiplier: options.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
      maxRestartAttempts: options.maxRestartAttempts ?? DEFAULT_MAX_RESTART_ATTEMPTS,
      onLog: options.onLog ?? (() => { }),
      onRestart: options.onRestart ?? (() => { }),
      onMaxRestartsExceeded: options.onMaxRestartsExceeded ?? (() => { }),
    };
  }

  /**
   * Calculates the backoff delay for the current restart attempt.
   * Uses exponential backoff with a maximum cap.
   * 
   * @returns Delay in milliseconds
   */
  public calculateBackoffDelay(): number {
    const { initialBackoffMs, maxBackoffMs, backoffMultiplier } = this.options;
    const delay = initialBackoffMs * Math.pow(backoffMultiplier, this.restartCount);
    return Math.min(delay, maxBackoffMs);
  }

  /**
   * Handles a loop exit detection.
   * @param result - Detection result from LoopDetector
   */
  public async handleLoopExit(result: LoopDetectionResult): Promise<void> {
    if (!result.exitDetected) return;

    await this.triggerRestart('loop-exit', result.reason);
  }

  /**
   * Handles a process crash (non-zero exit code).
   * @param exitCode - The exit code of the crashed process
   */
  public async handleCrash(exitCode: number): Promise<void> {
    // Exit code 0 is intentional exit, not a crash
    if (exitCode === 0) {
      await this.triggerRestart('loop-exit', 'Agent exited normally');
      return;
    }

    await this.triggerRestart('crash', `Exit code: ${exitCode}`, exitCode);
  }

  /**
   * Handles inactivity timeout.
   * @param reason - Reason for the inactivity
   */
  public async handleInactivity(reason: string): Promise<void> {
    await this.triggerRestart('inactivity', reason);
  }

  /**
   * Triggers a manual restart.
   * @param reason - Reason for the manual restart
   */
  public async manualRestart(reason?: string): Promise<void> {
    await this.triggerRestart('manual', reason ?? 'Manual restart requested');
  }

  /**
   * Core restart trigger logic.
   * @private
   */
  private async triggerRestart(
    type: RestartEventType,
    reason?: string,
    exitCode?: number
  ): Promise<void> {
    // Prevent concurrent restarts
    if (this.isRestarting) {
      this.log(`Restart already in progress, ignoring ${type} trigger`);
      return;
    }

    // Check if handler is stopped
    if (this.stopped) {
      this.log(`Handler stopped, ignoring ${type} trigger`);
      return;
    }

    // Check restart limits
    if (this.restartCount >= this.options.maxRestartAttempts) {
      this.log(`Max restart attempts (${this.options.maxRestartAttempts}) exceeded`);
      this.options.onMaxRestartsExceeded(this.restartCount);
      return;
    }

    this.isRestarting = true;
    this.restartCount++;
    const delayMs = this.calculateBackoffDelay();

    const event: RestartEvent = {
      type,
      attempt: this.restartCount,
      delayMs,
      reason,
      exitCode,
    };

    this.log(`Restart triggered: ${type} (attempt ${this.restartCount}/${this.options.maxRestartAttempts})`);
    if (reason) this.log(`Reason: ${reason}`);
    this.log(`Waiting ${delayMs}ms before restart...`);

    try {
      // Call the restart callback - this should trigger the actual restart
      await this.options.onRestart(event);
      this.lastRestartTime = new Date();
      this.log(`Restart initiated successfully`);
    } catch (error) {
      this.log(`Restart failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Attaches the handler to a LoopDetector.
   * @param detector - LoopDetector to attach to
   */
  public attachToDetector(detector: LoopDetector): void {
    detector.onLoopExit((result) => {
      this.handleLoopExit(result);
    });
    this.log('Attached to LoopDetector');
  }

  /**
   * Resets the restart counter.
   * Call this when the agent has been running stably for a while.
   */
  public resetCounter(): void {
    const previousCount = this.restartCount;
    this.restartCount = 0;
    if (previousCount > 0) {
      this.log(`Restart counter reset (was ${previousCount})`);
    }
  }

  /**
   * Stops the handler from triggering any more restarts.
   */
  public stop(): void {
    this.stopped = true;
    this.log('Restart handler stopped');
  }

  /**
   * Resumes the handler after being stopped.
   */
  public resume(): void {
    this.stopped = false;
    this.log('Restart handler resumed');
  }

  /**
   * Returns the current restart count.
   */
  public getRestartCount(): number {
    return this.restartCount;
  }

  /**
   * Returns whether a restart is currently in progress.
   */
  public isRestartInProgress(): boolean {
    return this.isRestarting;
  }

  /**
   * Returns whether the handler has been stopped.
   */
  public isStopped(): boolean {
    return this.stopped;
  }

  /**
   * Returns the time of the last restart, if any.
   */
  public getLastRestartTime(): Date | null {
    return this.lastRestartTime;
  }

  /**
   * Logs a message using the configured logger.
   * @private
   */
  private log(message: string): void {
    this.options.onLog(`[RestartHandler] ${message}`);
  }
}
