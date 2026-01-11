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
  sessionSaved: boolean;
  /** Session ID when saved */
  sessionId?: string;
  /** Error message when failed */
  error?: string;
  /** Whether shutdown completed successfully */
  success: boolean;
}

const DEFAULT_KILL_TIMEOUT_MS = 5000;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

/**
 * Manages graceful shutdown on SIGINT and SIGTERM signals.
 */
export class GracefulShutdown {
  private options: Required<GracefulShutdownOptions>;
  private isShuttingDown = false;
  private signalHandlers: Map<NodeJS.Signals, NodeJS.SignalsListener> = new Map();
  private emergencyCleanup: (() => void) | null = null;

  constructor(options: GracefulShutdownOptions) {
    this.options = {
      ...options,
      getSessionState: options.getSessionState ?? (() => null),
      onLog: options.onLog ?? (() => { }),
      killTimeoutMs: options.killTimeoutMs ?? DEFAULT_KILL_TIMEOUT_MS,
    };
  }

  /**
   * Installs signal handlers to SIGINT and SIGTERM.
   */
  public install(): void {
    const handler = this.createSignalHandler();
    SHUTDOWN_SIGNALS.forEach(sig => (this.signalHandlers.set(sig, handler), process.on(sig, handler)));

    this.emergencyCleanup = () => !this.isShuttingDown && this.options.killAgent().catch(() => { });
    process.on('exit', this.emergencyCleanup);

    const errorHandler = (err: any) => (console.error(err), this.emergencyCleanup?.(), process.exit(1));
    process.on('uncaughtException', errorHandler);
    process.on('unhandledRejection', errorHandler);

    this.log('Signal handlers installed');
  }

  /**
   * Removes installed signal handlers.
   */
  public uninstall(): void {
    this.signalHandlers.forEach((handler, signal) => process.removeListener(signal, handler));
    this.signalHandlers.clear();
    this.log('Signal handlers removed');
  }

  private createSignalHandler(): NodeJS.SignalsListener {
    return async () => {
      this.isShuttingDown || (this.isShuttingDown = true, this.handleShutdownResult(await this.performShutdown().catch(() => ({ success: false, sessionSaved: false }))));
    };
  }

  private handleShutdownResult(result: ShutdownResult): void {
    result.success && result.sessionSaved && result.sessionId && console.log(`\n✅ Session saved: ${result.sessionId}\n`);
    process.exit(result.success ? 0 : 1);
  }

  public async performShutdown(): Promise<ShutdownResult> {
    let sessionSaved = false;
    let sessionId: string | undefined;

    try {
      const state = this.options.getSessionState();
      state && (await this.saveSession(state), sessionSaved = true, sessionId = state.id);
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

  private async killWithTimeout(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => (this.log('Kill timeout reached, forcing exit'), resolve()), this.options.killTimeoutMs);
      this.options.killAgent()
        .then(() => (clearTimeout(timeoutId), resolve()))
        .catch((error) => (clearTimeout(timeoutId), reject(error)));
    });
  }

  private log(message: string): void {
    this.options.onLog(`[Shutdown] ${message}`);
  }

  public isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  public async triggerShutdown(): Promise<ShutdownResult> {
    return this.isShuttingDown
      ? { success: false, sessionSaved: false, error: 'Shutdown already in progress' }
      : (this.isShuttingDown = true, this.log('Manual shutdown triggered'), this.performShutdown());
  }
}
