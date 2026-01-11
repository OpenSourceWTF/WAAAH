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
    try {
      const output = execSync(`${cmd} --version 2>&1`, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });

      return this.requiresAuth(output) 
        ? this.getUnauthenticatedStatus(cmd) 
        : { authenticated: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return this.requiresAuth(msg)
        ? this.getUnauthenticatedStatus(cmd)
        : {
          authenticated: false,
          error: `❌ Failed to check ${cmd} auth: ${msg}`,
          instructions: this.getAuthInstructions(),
        };
    }
  }

  private getUnauthenticatedStatus(cmd: string): AuthStatus {
    return {
      authenticated: false,
      error: `❌ ${cmd} CLI requires authentication.`,
      instructions: this.getAuthInstructions(),
    };
  }

  protected requiresAuth(output: string): boolean {
    return this.getAuthPatterns().some(pattern => pattern.test(output));
  }

  public async start(): Promise<void> {
    await this.runWithRestart();
  }

  private async runWithRestart(): Promise<void> {
    const maxRestarts = this.getMaxRestarts();
    let exitCode = 0;

    while (true) {
      exitCode = await this.runOnce();
      const canRestart = maxRestarts === Infinity || this.restartCount < maxRestarts;

      if (!canRestart) {
        break;
      }

      this.restartCount++;
      console.log(`\n🔄 Restarting agent (attempt ${this.restartCount})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (exitCode !== 0) {
      console.log(`\n❌ Agent exited with code ${exitCode}. No more restarts.`);
    }
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

    this.ptyManager.onData((data: string) => {
      process.stdout.write(data);
    });

    process.stdin.on('data', this.stdinHandler);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    process.stdout.on('resize', this.resizeHandler);
  }

  private stdinHandler = (data: Buffer) => {
    if (data.includes(0x03)) {
      process.emit('SIGINT', 'SIGINT');
      return;
    }
    if (this.ptyManager?.isRunning()) {
      this.ptyManager.write(data.toString());
    }
  };

  private resizeHandler = () => {
    if (this.ptyManager?.isRunning()) {
      this.ptyManager.resize(process.stdout.columns || 80, process.stdout.rows || 24);
    }
  };

  private cleanupHandlers(): void {
    process.stdin.removeListener('data', this.stdinHandler);
    process.stdout.removeListener('resize', this.resizeHandler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
    console.log('\nAgent exited.');
  }

  public async sendPrompt(prompt: string): Promise<void> {
    if (this.ptyManager?.isRunning()) {
      this.ptyManager.write(prompt + '\r');
    } else {
      throw new Error('Agent not running');
    }
  }

  public async stop(): Promise<void> {
    this.ptyManager?.kill();
  }
}