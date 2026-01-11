/**
 * BaseAgent - Abstract base class that CLI agent implementations extend
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
 * Abstract base class that CLI agent implementations extend.
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

  public async checkInstalled(): Promise<boolean> {
    try { return execSync(`which ${this.getCliCommand()}`, { stdio: 'pipe' }), true; }
    catch { return false; }
  }

  public async checkAuthenticated(): Promise<boolean> {
    return (await this.checkAuth()).authenticated;
  }

  public async checkAuth(): Promise<AuthStatus> {
    return this.buildAuthStatus(this.getCliCommand(), this.tryGetVersionOutput(this.getCliCommand()));
  }

  private tryGetVersionOutput(cmd: string): { output?: string; error?: string } {
    try {
      return { output: execSync(`${cmd} --version 2>&1`, { encoding: 'utf-8', timeout: 10000, stdio: 'pipe' }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private buildAuthStatus(cmd: string, result: { output?: string; error?: string }): AuthStatus {
    const text = result.output || result.error || '';
    return this.requiresAuth(text)
      ? { authenticated: false, error: `❌ ${cmd} CLI requires authentication.`, instructions: this.getAuthInstructions() }
      : result.error
        ? { authenticated: false, error: `❌ Failed to check ${cmd} auth: ${result.error}`, instructions: this.getAuthInstructions() }
        : { authenticated: true };
  }

  protected requiresAuth(output: string): boolean {
    return this.getAuthPatterns().some(pattern => pattern.test(output));
  }

  public async start(): Promise<void> { await this.runWithRestart(); }

  private async runWithRestart(): Promise<void> {
    const maxRestarts = this.getMaxRestarts();
    let exitCode = await this.runOnce();

    while (maxRestarts === Infinity || this.restartCount < maxRestarts) {
      this.restartCount++;
      console.log(`\n🔄 Restarting agent (attempt ${this.restartCount})...`);
      await this.delay(1000);
      exitCode = await this.runOnce();
    }

    exitCode !== 0 && console.log(`\n❌ Agent exited with code ${exitCode}. No more restarts.`);
  }

  private delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }

  private getMaxRestarts(): number {
    const { restartOnExit } = this.config;
    return restartOnExit === true ? Infinity : (typeof restartOnExit === 'number' ? restartOnExit : 0);
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
      this.ptyManager?.onExit((code: number) => (this.cleanupHandlers(), resolve(code)));
    });
  }

  protected setupPtyHandlers(): void {
    this.ptyManager && (
      this.ptyManager.onData((data: string) => process.stdout.write(data)),
      process.stdin.on('data', this.stdinHandler),
      this.enableRawMode(),
      process.stdout.on('resize', this.resizeHandler)
    );
  }

  private enableRawMode(): void {
    process.stdin.isTTY && (process.stdin.setRawMode(true), process.stdin.resume());
  }

  private disableRawMode(): void {
    process.stdin.isTTY && (process.stdin.setRawMode(false), process.stdin.pause());
  }

  private stdinHandler = (data: Buffer) => {
    data.includes(0x03) ? process.emit('SIGINT', 'SIGINT') : this.ptyManager?.isRunning() && this.ptyManager.write(data.toString());
  };

  private resizeHandler = () => {
    this.ptyManager?.isRunning() && this.ptyManager.resize(process.stdout.columns || 80, process.stdout.rows || 24);
  };

  private cleanupHandlers(): void {
    process.stdin.removeListener('data', this.stdinHandler);
    process.stdout.removeListener('resize', this.resizeHandler);
    this.disableRawMode();
    console.log('\nAgent exited.');
  }

  public async sendPrompt(prompt: string): Promise<void> {
    this.ptyManager?.isRunning() ? this.ptyManager.write(prompt + '\r') : (() => { throw new Error('Agent not running'); })();
  }

  public async stop(): Promise<void> { this.ptyManager?.kill(); }
}