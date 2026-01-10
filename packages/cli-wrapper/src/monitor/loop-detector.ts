/**
 * LoopDetector - Agent loop exit detection and activity monitoring
 * 
 * Monitors agent output to detect when the agent exits the main processing loop.
 * Triggers automatic restart when loop exit is detected or prolonged idle is observed.
 * Uses an EventEmitter pattern for 'active', 'idle', and 'loop-exit' events.
 * 
 * @packageDocumentation
 */

/**
 * Loop monitoring state.
 */
export enum LoopState {
  /** Initial state, waiting for first activity */
  STARTING = 'starting',
  /** Agent is actively producing output */
  ACTIVE = 'active',
  /** No activity for heartbeat interval */
  IDLE = 'idle',
  /** Loop exit was detected */
  EXITED = 'exited',
}

/**
 * Loop detection result containing exit information.
 */
export interface LoopDetectionResult {
  /** Whether a loop exit was detected */
  exitDetected: boolean;
  /** Reason for the detection (if any) */
  reason?: string;
  /** Confidence level (0-1) */
  confidence: number;
  /** Pattern that triggered detection */
  pattern?: string;
}

/**
 * Configuration options for LoopDetector.
 */
export interface LoopDetectorOptions {
  /** Heartbeat interval in milliseconds (default: 120000 = 2 minutes) */
  heartbeatIntervalMs?: number;
  /** Check interval in milliseconds (default: 30000 = 30 seconds) */
  checkIntervalMs?: number;
  /** Custom exit patterns to detect */
  customExitPatterns?: RegExp[];
}

/**
 * Event types emitted by LoopDetector.
 */
export type LoopEventType = 'active' | 'idle' | 'loop-exit';

/**
 * Event handler callback.
 */
export type LoopEventHandler = (result?: LoopDetectionResult) => void;

/**
 * Patterns that indicate the agent has exited its main loop.
 * These are matched case-insensitively against agent output.
 */
const EXIT_PATTERNS: RegExp[] = [
  /goodbye/i,
  /session\s+ended/i,
  /exiting\s+the\s+loop/i,
  /agent\s+stopping/i,
  /wait_for_prompt\s+timed?\s*out/i,
  /shutting\s+down/i,
  /process\s+exit/i,
  /fatal\s+error/i,
  /unhandled\s+rejection/i,
  /SIGTERM|SIGINT|SIGKILL/,
];

/**
 * Monitors agent output for loop exit conditions and activity state.
 * 
 * The LoopDetector watches stdout from the agent process and:
 * 1. Tracks activity to determine if the agent is working
 * 2. Fires 'idle' events when no activity for the heartbeat interval
 * 3. Detects patterns indicating the agent has exited its loop
 * 4. Emits events for state transitions
 * 
 * @example
 * ```typescript
 * const detector = new LoopDetector({ heartbeatIntervalMs: 120000 });
 * 
 * detector.on('active', () => console.log('Agent is working'));
 * detector.on('idle', () => console.log('Agent went idle'));
 * detector.on('loop-exit', (result) => {
 *   console.log('Loop exit detected:', result.reason);
 *   restartAgent();
 * });
 * 
 * detector.start();
 * 
 * // Process agent output
 * ptyManager.onData((data) => detector.processOutput(data));
 * ```
 */
export class LoopDetector {
  /** Current monitoring state */
  private state: LoopState = LoopState.STARTING;

  /** Timestamp of last activity */
  private lastActivityTime: Date = new Date();

  /** Heartbeat interval in ms */
  private heartbeatIntervalMs: number;

  /** Check interval in ms */
  private checkIntervalMs: number;

  /** Custom exit patterns */
  private customExitPatterns: RegExp[];

  /** Event listeners by event type */
  private listeners: Map<LoopEventType, LoopEventHandler[]> = new Map();

  /** Interval timer for checking idle state */
  private checkInterval: NodeJS.Timeout | null = null;

  /** Whether the detector is running */
  private running = false;

  /**
   * Creates a new LoopDetector instance.
   * 
   * @param options - Configuration options
   * 
   * @example
   * ```typescript
   * // Default 2-minute heartbeat
   * const detector = new LoopDetector();
   * 
   * // Custom 1-minute heartbeat
   * const fastDetector = new LoopDetector({ heartbeatIntervalMs: 60000 });
   * ```
   */
  constructor(options: LoopDetectorOptions = {}) {
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 120000; // 2 minutes
    this.checkIntervalMs = options.checkIntervalMs ?? 30000; // 30 seconds
    this.customExitPatterns = options.customExitPatterns ?? [];

    // Initialize listener maps
    this.listeners.set('active', []);
    this.listeners.set('idle', []);
    this.listeners.set('loop-exit', []);
  }

  /**
   * Process agent output for activity and exit patterns.
   * 
   * This should be called with each chunk of stdout/stderr from the agent.
   * It updates the activity timestamp and checks for exit patterns.
   * 
   * @param output - Raw output from the agent process
   * @returns Detection result if a pattern was matched
   * 
   * @example
   * ```typescript
   * ptyManager.onData((data) => {
   *   const result = detector.processOutput(data);
   *   if (result?.exitDetected) {
   *     handleLoopExit(result);
   *   }
   * });
   * ```
   */
  public processOutput(output: string): LoopDetectionResult | null {
    // Update activity timestamp
    this.lastActivityTime = new Date();

    // Transition to active state if needed
    if (this.state !== LoopState.ACTIVE) {
      this.state = LoopState.ACTIVE;
      this.emit('active');
    }

    // Check for exit patterns
    const result = this.detectExitPattern(output);
    if (result.exitDetected) {
      this.state = LoopState.EXITED;
      this.emit('loop-exit', result);
    }

    return result.exitDetected ? result : null;
  }

  /**
   * Register an event listener.
   * 
   * @param event - Event type to listen for
   * @param handler - Handler function
   * 
   * @example
   * ```typescript
   * detector.on('loop-exit', (result) => {
   *   console.log('Exit detected:', result?.reason);
   * });
   * ```
   */
  public on(event: LoopEventType, handler: LoopEventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.push(handler);
    }
  }

  /**
   * Remove an event listener.
   * 
   * @param event - Event type
   * @param handler - Handler function to remove
   */
  public off(event: LoopEventType, handler: LoopEventHandler): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
    }
  }

  /**
   * Start the idle monitor.
   * 
   * Begins periodic checks for inactivity and fires 'idle' events
   * when no activity is detected for the heartbeat interval.
   * 
   * @example
   * ```typescript
   * detector.start();
   * // ... later
   * detector.stop();
   * ```
   */
  public start(): void {
    if (this.running) return;

    this.running = true;
    this.lastActivityTime = new Date();

    this.checkInterval = setInterval(() => {
      this.checkIdleState();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the idle monitor.
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.running = false;
  }

  /**
   * Reset the detector to initial state.
   */
  public reset(): void {
    this.state = LoopState.STARTING;
    this.lastActivityTime = new Date();
  }

  /**
   * Check if the detector is currently running.
   * 
   * @returns True if monitoring is active
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the current loop state.
   * 
   * @returns Current state
   */
  public getState(): LoopState {
    return this.state;
  }

  /**
   * Get the timestamp of last activity.
   * 
   * @returns Last activity timestamp
   */
  public getLastActivityTime(): Date {
    return this.lastActivityTime;
  }

  /**
   * Manually analyze output for exit patterns without updating state.
   * 
   * @param output - Output to analyze
   * @returns Detection result
   * @deprecated Use processOutput instead
   */
  public analyze(output: string): LoopDetectionResult {
    return this.detectExitPattern(output);
  }

  /**
   * Check for inactivity-based idle state.
   * 
   * @returns Detection result based on inactivity
   */
  public checkInactivity(): LoopDetectionResult {
    const now = new Date();
    const elapsed = now.getTime() - this.lastActivityTime.getTime();

    if (elapsed > this.heartbeatIntervalMs) {
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
   * Emit an event to all registered listeners.
   */
  private emit(event: LoopEventType, result?: LoopDetectionResult): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(result);
        } catch (err) {
          console.error(`Error in ${event} handler:`, err);
        }
      }
    }
  }

  /**
   * Check idle state and emit events if needed.
   */
  private checkIdleState(): void {
    const now = new Date();
    const elapsed = now.getTime() - this.lastActivityTime.getTime();

    if (elapsed > this.heartbeatIntervalMs && this.state === LoopState.ACTIVE) {
      this.state = LoopState.IDLE;
      this.emit('idle', {
        exitDetected: false,
        reason: `No activity for ${Math.floor(elapsed / 1000)} seconds`,
        confidence: 0.8,
      });
    }
  }

  /**
   * Detect exit patterns in output.
   */
  private detectExitPattern(output: string): LoopDetectionResult {
    // Check built-in patterns
    for (const pattern of EXIT_PATTERNS) {
      if (pattern.test(output)) {
        return {
          exitDetected: true,
          reason: `Matched exit pattern: ${pattern.source}`,
          confidence: 0.9,
          pattern: pattern.source,
        };
      }
    }

    // Check custom patterns
    for (const pattern of this.customExitPatterns) {
      if (pattern.test(output)) {
        return {
          exitDetected: true,
          reason: `Matched custom pattern: ${pattern.source}`,
          confidence: 0.85,
          pattern: pattern.source,
        };
      }
    }

    return {
      exitDetected: false,
      confidence: 0,
    };
  }

  /**
   * Legacy callback registration.
   * @deprecated Use on('loop-exit', callback) instead
   */
  public onLoopExit(callback: (result: LoopDetectionResult) => void): void {
    this.on('loop-exit', (result) => {
      if (result) {
        callback(result);
      }
    });
  }

  /**
   * Legacy method to start monitor.
   * @deprecated Use start() instead
   */
  public startMonitor(intervalMs?: number): NodeJS.Timeout {
    if (intervalMs) {
      this.checkIntervalMs = intervalMs;
    }
    this.start();
    return this.checkInterval!;
  }
}
