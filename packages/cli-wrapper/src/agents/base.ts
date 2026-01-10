/**
 * BaseAgent - Abstract base class for CLI agent implementations
 * 
 * Defines the common interface for spawning and managing external CLI coding agents.
 * 
 * @packageDocumentation
 */

import { PTYManager } from '../pty/manager.js';

/**
 * Configuration options for agent initialization.
 */
export interface AgentConfig {
  /** The workflow to execute (e.g., 'waaah-orc') */
  workflow: string;
  /** Whether to resume a previous session */
  resume?: boolean;
  /** Path to the workspace root */
  workspaceRoot: string;
  /** Restart on exit - if true or number, will restart on exit. Number specifies max restarts. */
  restartOnExit?: boolean | number;
}

/**
 * Abstract base class for CLI agent implementations.
 * 
 * @example
 * ```typescript
 * class GeminiAgent extends BaseAgent {
 *   protected getCliCommand(): string {
 *     return 'gemini';
 *   }
 * }
 * ```
 */
export abstract class BaseAgent {
  public config: AgentConfig;
  protected ptyManager: PTYManager | null = null;
  protected restartCount = 0;

  /**
   * Creates a new agent instance.
   * @param config - Agent configuration options
   */
  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Returns the CLI command to spawn.
   * @returns The CLI executable name or path
   */
  protected abstract getCliCommand(): string;

  /**
   * Returns the arguments to pass to the CLI.
   * @returns Array of CLI arguments
   */
  protected abstract getCliArgs(): string[];

  /**
   * Checks if the CLI is installed and accessible.
   * @returns Promise resolving to true if CLI is available
   * @throws Error if CLI is not found
   */
  public abstract checkInstalled(): Promise<boolean>;

  /**
   * Checks if the CLI is authenticated/logged in.
   * @returns Promise resolving to true if authenticated
   */
  public abstract checkAuthenticated(): Promise<boolean>;

  /**
   * Starts the agent with the configured workflow.
   * Supports automatic restart via restartOnExit config option.
   * @returns Promise that resolves when the agent exits (after all restarts)
   */
  public async start(): Promise<void> {
    await this.runWithRestart();
  }

  /**
   * Internal method that handles the restart loop.
   */
  private async runWithRestart(): Promise<void> {
    const maxRestarts = this.getMaxRestarts();

    while (true) {
      const exitCode = await this.runOnce();

      // Check if we should restart
      if (maxRestarts === Infinity || this.restartCount < maxRestarts) {
        this.restartCount++;
        console.log(`\n🔄 Restarting agent (attempt ${this.restartCount})...`);
        // Small delay before restart
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      // Max restarts reached or restartOnExit is false/undefined
      if (exitCode !== 0) {
        console.log(`\n❌ Agent exited with code ${exitCode}. No more restarts.`);
      }
      break;
    }
  }

  /**
   * Gets the maximum number of restarts from config.
   */
  private getMaxRestarts(): number {
    const { restartOnExit } = this.config;
    if (restartOnExit === true) {
      return Infinity;
    }
    if (typeof restartOnExit === 'number') {
      return restartOnExit;
    }
    return 0;
  }

  /**
   * Runs the agent once and returns the exit code.
   */
  private async runOnce(): Promise<number> {
    this.ptyManager = new PTYManager();

    // Forward PTY output to stdout
    this.ptyManager.onData((data: string) => {
      process.stdout.write(data);
    });

    // Handle stdin forwarding with Ctrl+C detection
    const stdinHandler = (data: Buffer) => {
      // Detect Ctrl+C (0x03) in raw mode and emit SIGINT
      if (data.includes(0x03)) {
        process.emit('SIGINT', 'SIGINT');
        return;
      }
      if (this.ptyManager && this.ptyManager.isRunning()) {
        this.ptyManager.write(data.toString());
      }
    };
    process.stdin.on('data', stdinHandler);

    // Initial setup for raw mode if possible (to forward keypresses)
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    // Spawn the process
    await this.ptyManager.spawn({
      command: this.getCliCommand(),
      args: this.getCliArgs(),
      env: { ...process.env, FORCE_COLOR: '1' },
      cols: process.stdout.columns || 80,
      rows: process.stdout.rows || 24,
    });

    // Resize PTY on window resize
    const resizeHandler = () => {
      if (this.ptyManager && this.ptyManager.isRunning()) {
        this.ptyManager.resize(process.stdout.columns || 80, process.stdout.rows || 24);
      }
    };
    process.stdout.on('resize', resizeHandler);

    // Return a promise that resolves with exit code when process exits
    return new Promise<number>((resolve, reject) => {
      if (!this.ptyManager) return reject(new Error('PTY not initialized'));

      this.ptyManager.onExit((code: number) => {
        // Cleanup handlers
        process.stdin.removeListener('data', stdinHandler);
        process.stdout.removeListener('resize', resizeHandler);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        }

        console.log(`\nAgent exited with code ${code}`);
        resolve(code);
      });
    });
  }

  /**
   * Sends a prompt/message to the running agent.
   * @param prompt - The prompt text to send
   */
  public async sendPrompt(prompt: string): Promise<void> {
    if (this.ptyManager && this.ptyManager.isRunning()) {
      this.ptyManager.write(prompt);
      this.ptyManager.write('\r'); // Enter
    } else {
      throw new Error('Agent not running');
    }
  }

  /**
   * Gracefully stops the agent.
   */
  public async stop(): Promise<void> {
    if (this.ptyManager && this.ptyManager.isRunning()) {
      this.ptyManager.kill();
    }
  }
}
