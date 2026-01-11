/**
 * GracefulShutdown - Signal handlers to clean termination
 *
 * Handles SIGINT (Ctrl+C) and SIGTERM signals to ensure clean shutdown
 * of agent processes with session state preservation.
 *
 * @packageDocumentation
 */

import { SessionManager, SessionState } from '../session/manager.js';

/**
 * Options to configuring graceful shutdown.
 */
export interface GracefulShutdownOptions {
  /** Session manager instance to saving state */
  sessionManager: SessionManager;
  /** Callback to kill the PTY process */
  killAgent: () => Promise<void>;
  /** Current session state (when any) */
  getSessionState?: () => SessionState | null;
  /** Callback to logging */
  onLog?: (message: string) => void;
  /** Timeout to kill operation in milliseconds (default: 5000) */
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
  /** Session ID when saved */
  sessionId?: string;
  /** Error message when failed */
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
 */
export class GracefulShutdown {
  private options: Required<GracefulShutdownOptions>;
  private isShuttingDown = false;
  private signalHandlers: Map<NodeJS.Signals, NodeJS.SignalsListener> = new Map();
  private emergencyCleanup: (() => void) | null = null;

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

  /**
   * Installs signal handlers to SIGINT and SIGTERM.
   * Also installs emergency cleanup handlers to unexpected exits.
   */
  public install(): void {
    const handler = this.handleSignal.bind(this);

    this.signalHandlers.set('SIGINT', handler);
    this.signalHandlers.set('SIGTERM', handler);

    process.on('SIGINT', handler);
    process.on('SIGTERM', handler);

    this.installEmergencyHandlers();
    this.log('Signal handlers installed');
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

  private installEmergencyHandlers(): void {
    this.emergencyCleanup = () => {
      this.isShuttingDown || this.options.killAgent().catch(() => { });
    };

    process.on('exit', this.emergencyCleanup);
    
    const errorHandler = this.handleUncaughtError.bind(this);
    process.on('uncaughtException', errorHandler);
    process.on('unhandledRejection', errorHandler);
  }

  private handleUncaughtError(err: any): void {
    console.error(err);
    this.emergencyCleanup?.();
    process.exit(1);
  }

  /**
   * Handles incoming termination signals.
   */
  private async handleSignal(signal: NodeJS.Signals): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    try {
      const result = await this.performShutdown();
      this.handleShutdownResult(result);
    } catch {
      process.exit(1);
    }
  }

  private handleShutdownResult(result: ShutdownResult): void {
    if (result.success && result.sessionSaved && result.sessionId) {
      console.log(`\n✅ Session saved: ${result.sessionId}\n`);
    }
    process.exit(result.success ? 0 : 1);
  }

  public async performShutdown(): Promise<ShutdownResult> {
    let sessionSaved = false;
    let sessionId: string | undefined;

    try {
      const state = this.options.getSessionState();
      if (state) {
        await this.saveSession(state);
        sessionSaved = true;
        sessionId = state.id;
      }

      await this.killWithTimeout();
      return { success: true, sessionSaved, sessionId };
    } catch (error) {
      return {
        success: false,
        sessionSaved,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async saveSession(state: SessionState): Promise<void> {
    state.gracefulExit = true;
    state.updatedAt = new Date();
    await this.options.sessionManager.save(state);
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
