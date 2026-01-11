/**
 * BaseAgent - Abstract base class to CLI agent implementations
 * 
 * Defines the common interface to spawning and managing external CLI coding agents.
 * 
 * @packageDocumentation
 */

import { PTYManager } from '../pty/manager.js';
import { execSync } from 'child_process';

/**
 * Configuration options to agent initialization.
 */
export interface AgentConfig {
  /** The workflow to execute (e.g., 'waaah-orc') */
  workflow: string;
  /** Whether to resume a previous session */
  resume?: boolean;
  /** Path to the workspace root */
  workspaceRoot: string;
  /** Restart on exit - when true or number, will restart on exit. Number specifies max restarts. */
  restartOnExit?: boolean | number;
  /** Sanitize TUI output by stripping cursor movement sequences (default: true) */
  sanitizeOutput?: boolean;
}

/**
 * Authentication status result.
 */
export interface AuthStatus {
  /** Whether the CLI is authenticated */
  authenticated: boolean;
  /** Error message when not authenticated */
  error?: string;
  /** Instructions to authenticating */
  instructions?: string;
}

/**
 * Abstract base class to CLI agent implementations.
 */
export abstract class BaseAgent {
  public config: AgentConfig;
  protected ptyManager: PTYManager | null = null;
  protected restartCount = 0;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  protected abstract getCliCommand(): string;
  protected abstract getCliArgs(): string[];
  protected abstract getAuthPatterns(): RegExp[];
  public abstract getAuthInstructions(): string;
  public abstract getInstallInstructions(): string;

  /**
   * Checks whether the CLI is installed and accessible.
   */
  public async checkInstalled(): Promise<boolean> {
    try {
      execSync(`which ${this.getCliCommand()}`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks whether the CLI is authenticated.
   */
  public async checkAuthenticated(): Promise<boolean> {
    const status = await this.checkAuth();
    return status.authenticated;
  }

  /**
   * Performs authentication check.
   */
  public async checkAuth(): Promise<AuthStatus> {
    const cmd = this.getCliCommand();
    const output = this.tryGetVersionOutput(cmd);
    return this.buildAuthStatus(cmd, output);
  }

  private tryGetVersionOutput(cmd: string): { output?: string; error?: string } {
    try {
      const output = execSync(`${cmd} --version 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });
      return { output };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private buildAuthStatus(cmd: string, result: { output?: string; error?: string }): AuthStatus {
    const text = result.output || result.error || '';

    if (this.requiresAuth(text)) {
      return {
        authenticated: false,
        error: `❌ ${cmd} CLI requires authentication.`,
        instructions: this.getAuthInstructions(),
      };
    }

    if (result.error) {
      return {
        authenticated: false,
        error: `❌ Failed to check ${cmd} auth: ${result.error}`,
        instructions: this.getAuthInstructions(),
      };
    }

    return { authenticated: true };
  }

  protected requiresAuth(output: string): boolean {
    return this.getAuthPatterns().some(pattern => pattern.test(output));
  }

  public async start(): Promise<void> {
    await this.runWithRestart();
  }

  private async runWithRestart(): Promise<void> {
    const maxRestarts = this.getMaxRestarts();
    let exitCode = await this.runOnce();

    while (this.shouldRestart(exitCode, maxRestarts)) {
      this.restartCount++;
      console.log(`\n🔄 Restarting agent (attempt ${this.restartCount})...`);
      await this.delay(1000);
      exitCode = await this.runOnce();
    }

    this.logFinalExit(exitCode);
  }

  private shouldRestart(exitCode: number, maxRestarts: number): boolean {
    return maxRestarts === Infinity || this.restartCount < maxRestarts;
  }

  private logFinalExit(exitCode: number): void {
    if (exitCode !== 0) {
      console.log(`\n❌ Agent exited with code ${exitCode}. No more restarts.`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getMaxRestarts(): number {
    const { restartOnExit } = this.config;
    if (restartOnExit === true) return Infinity;
    return typeof restartOnExit === 'number' ? restartOnExit : 0;
  }

  private async runOnce(): Promise<number> {
    this.ptyManager = new PTYManager();
    this.setupPtyHandlers();

    await this.ptyManager.spawn({
      command: this.getCliCommand(),
      args: this.getCliArgs(),
      env: { ...process.env, FORCE_COLOR: '1' },
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
      sanitizeOutput: this.config.sanitizeOutput ?? false,
    });

    return new Promise<number>((resolve) => {
      this.ptyManager?.onExit((code: number) => {
        this.cleanupHandlers();
        resolve(code);
      });
    });
  }

  protected setupPtyHandlers(): void {
    if (!this.ptyManager) return;

    this.ptyManager.onData((data: string) => process.stdout.write(data));
    process.stdin.on('data', this.stdinHandler);
    this.enableRawMode();
    process.stdout.on('resize', this.resizeHandler);
  }

  private enableRawMode(): void {
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  private disableRawMode(): void {
    if (!process.stdin.isTTY) return;
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  private stdinHandler = (data: Buffer) => {
    if (this.isInterruptSignal(data)) {
      process.emit('SIGINT', 'SIGINT');
      return;
    }
    this.forwardToAgent(data);
  };

  private isInterruptSignal(data: Buffer): boolean {
    return data.includes(0x03);
  }

  private forwardToAgent(data: Buffer): void {
    if (this.ptyManager?.isRunning()) {
      this.ptyManager.write(data.toString());
    }
  }

  private resizeHandler = () => {
    if (!this.ptyManager?.isRunning()) return;
    this.ptyManager.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  };

  private cleanupHandlers(): void {
    process.stdin.removeListener('data', this.stdinHandler);
    process.stdout.removeListener('resize', this.resizeHandler);
    this.disableRawMode();
    console.log('\nAgent exited.');
  }

  public async sendPrompt(prompt: string): Promise<void> {
    if (!this.ptyManager?.isRunning()) {
      throw new Error('Agent not running');
    }
    this.ptyManager.write(prompt + '\r');
  }

  public async stop(): Promise<void> {
    this.ptyManager?.kill();
  }
}