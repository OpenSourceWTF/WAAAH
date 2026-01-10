/**
 * GracefulShutdown - Signal handlers for clean termination
 * 
 * Handles SIGINT (Ctrl+C) and SIGTERM signals to ensure clean shutdown
 * of agent processes with session state preservation.
 * 
 * @packageDocumentation
 */

import { SessionManager, SessionState } from '../session/manager.js';

/**
 * Options for configuring graceful shutdown.
 */
export interface GracefulShutdownOptions {
  /** Session manager instance for saving state */
  sessionManager: SessionManager;
  /** Callback to kill the PTY process */
  killAgent: () => Promise<void>;
  /** Current session state (if any) */
  getSessionState?: () => SessionState | null;
  /** Callback for logging */
  onLog?: (message: string) => void;
  /** Timeout for kill operation in milliseconds (default: 5000) */
  killTimeoutMs?: number;
}

/**
 * Result of shutdown operation.
 */
export interface ShutdownResult {
  /** Whether shutdown completed successfully */
  success: boolean;
  /** Whether session was saved */
  sessionSaved: boolean;
  /** Session ID if saved */
  sessionId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Manages graceful shutdown on SIGINT and SIGTERM signals.
 * 
 * When a termination signal is received:
 * 1. Saves current session state
 * 2. Kills the PTY process gracefully
 * 3. Displays resume instructions
 * 4. Exits cleanly
 * 
 * @example
 * ```typescript
 * const shutdown = new GracefulShutdown({
 *   sessionManager: new SessionManager(workspaceRoot),
 *   killAgent: async () => { await agent.kill(); },
 *   getSessionState: () => currentSession,
 *   onLog: console.log,
 * });
 * 
 * shutdown.install();
 * 
 * // On shutdown, user will see:
 * // "Session saved. Run `waaah agent --resume` to continue."
 * ```
 */
export class GracefulShutdown {
  private options: Required<GracefulShutdownOptions>;
  private isShuttingDown = false;
  private signalHandlers: Map<NodeJS.Signals, NodeJS.SignalsListener> = new Map();

  /**
   * Creates a new GracefulShutdown instance.
   * @param options - Configuration options
   */
  constructor(options: GracefulShutdownOptions) {
    this.options = {
      ...options,
      getSessionState: options.getSessionState ?? (() => null),
      onLog: options.onLog ?? (() => { }),
      killTimeoutMs: options.killTimeoutMs ?? 5000,
    };
  }

  private emergencyCleanup: (() => void) | null = null;

  /**
   * Installs signal handlers for SIGINT and SIGTERM.
   * Also installs emergency cleanup handlers for unexpected exits.
   * 
   * @example
   * ```typescript
   * shutdown.install();
   * // Now Ctrl+C will trigger graceful shutdown
   * ```
   */
  public install(): void {
    const handler = this.createSignalHandler();

    // Install signal handlers
    this.signalHandlers.set('SIGINT', handler);
    this.signalHandlers.set('SIGTERM', handler);

    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);

    // Emergency cleanup for unexpected exits (orphan prevention)
    this.emergencyCleanup = () => {
      if (!this.isShuttingDown) {
        try {
          // Attempt synchronous kill - best effort
          this.options.killAgent().catch(() => { });
        } catch { /* ignore */ }
      }
    };

    process.on('exit', this.emergencyCleanup);
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      this.emergencyCleanup?.();
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      this.emergencyCleanup?.();
      process.exit(1);
    });

    this.log('Signal handlers installed (SIGINT, SIGTERM, exit, uncaught)');
  }

  /**
   * Removes installed signal handlers.
   */
  public uninstall(): void {
    for (const [signal, handler] of this.signalHandlers) {
      process.removeListener(signal, handler);
    }
    this.signalHandlers.clear();
    this.log('Signal handlers removed');
  }

  /**
   * Creates the signal handler function.
   * @private
   */
  private createSignalHandler(): NodeJS.SignalsListener {
    return async (signal: NodeJS.Signals) => {
      // Prevent multiple concurrent shutdowns
      if (this.isShuttingDown) {
        this.log(`Already shutting down, ignoring ${signal}`);
        return;
      }

      this.isShuttingDown = true;
      this.log(`\nReceived ${signal}, initiating graceful shutdown...`);

      try {
        const result = await this.performShutdown();

        if (result.success) {
          if (result.sessionSaved && result.sessionId) {
            console.log('\n✅ Session saved.');
            console.log(`   Run \`waaah agent --resume\` to continue.\n`);
          } else {
            console.log('\n✅ Shutdown complete.\n');
          }
          process.exit(0);
        } else {
          console.error(`\n❌ Shutdown error: ${result.error}\n`);
          process.exit(1);
        }
      } catch (error) {
        console.error('\n❌ Shutdown failed:', error);
        process.exit(1);
      }
    };
  }

  /**
   * Performs the graceful shutdown sequence.
   * @returns Result of the shutdown operation
   */
  public async performShutdown(): Promise<ShutdownResult> {
    let sessionSaved = false;
    let sessionId: string | undefined;

    try {
      // Step 1: Save session state
      const sessionState = this.options.getSessionState();
      if (sessionState) {
        this.log('Saving session state...');
        sessionState.gracefulExit = true;
        sessionState.updatedAt = new Date();
        await this.options.sessionManager.save(sessionState);
        sessionSaved = true;
        sessionId = sessionState.id;
        this.log(`Session saved: ${sessionId}`);
      }

      // Step 2: Kill PTY process with timeout
      this.log('Terminating agent process...');
      await this.killWithTimeout();
      this.log('Agent process terminated');

      return {
        success: true,
        sessionSaved,
        sessionId,
      };
    } catch (error) {
      return {
        success: false,
        sessionSaved,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Kills the agent with a timeout.
   * @private
   */
  private async killWithTimeout(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.log('Kill timeout reached, forcing exit');
        resolve();
      }, this.options.killTimeoutMs);

      this.options.killAgent()
        .then(() => {
          clearTimeout(timeoutId);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Logs a message using the configured logger.
   * @private
   */
  private log(message: string): void {
    this.options.onLog(`[Shutdown] ${message}`);
  }

  /**
   * Returns whether a shutdown is in progress.
   */
  public isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Manually triggers a graceful shutdown.
   * Useful for programmatic shutdown scenarios.
   */
  public async triggerShutdown(): Promise<ShutdownResult> {
    if (this.isShuttingDown) {
      return {
        success: false,
        sessionSaved: false,
        error: 'Shutdown already in progress',
      };
    }

    this.isShuttingDown = true;
    this.log('Manual shutdown triggered');
    return this.performShutdown();
  }
}
