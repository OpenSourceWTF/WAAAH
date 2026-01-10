/**
 * @fileoverview Gemini CLI agent implementation.
 * Extends BaseAgent to provide Gemini-specific CLI spawning and management.
 */

import * as pty from 'node-pty';
import { execSync } from 'child_process';
import { BaseAgent, AgentConfig } from './base.js';

/**
 * Error thrown when Gemini CLI is not installed.
 */
export class GeminiNotInstalledError extends Error {
  constructor() {
    super('Gemini CLI not found. Install with: npm install -g @google/gemini-cli');
    this.name = 'GeminiNotInstalledError';
  }
}

/**
 * Error thrown when Gemini requires login.
 */
export class GeminiLoginRequiredError extends Error {
  constructor() {
    super('Gemini requires login. Run: gemini auth');
    this.name = 'GeminiLoginRequiredError';
  }
}

/**
 * Output patterns for detecting Gemini-specific states.
 */
const GEMINI_PATTERNS = {
  /** Pattern indicating Gemini requires authentication */
  LOGIN_REQUIRED: /please authenticate|login required|not authenticated|gemini auth/i,
  /** Pattern indicating Gemini is ready for input */
  READY: /gemini>/i,
  /** Pattern indicating an error occurred */
  ERROR: /error:|exception:|fatal:/i,
} as const;

/**
 * Gemini CLI agent implementation.
 * 
 * This agent spawns and manages the Gemini CLI via PTY, providing
 * real-time output streaming, login detection, and graceful shutdown.
 * 
 * @extends BaseAgent
 * 
 * @example
 * ```typescript
 * const agent = new GeminiAgent({
 *   workingDirectory: '/path/to/project',
 *   workflowPath: '.agent/workflows/waaah-orc.md'
 * });
 * 
 * agent.onOutput((data) => console.log(data));
 * agent.onExit((code) => console.log('Exited with:', code));
 * 
 * await agent.spawn();
 * agent.sendInput('/waaah-orc\n');
 * ```
 */
export class GeminiAgent extends BaseAgent {
  /**
   * Human-readable name of the agent.
   */
  readonly name = 'Gemini';

  /**
   * CLI command to spawn.
   */
  readonly command = 'gemini';

  /**
   * Path to Gemini's MCP configuration file.
   */
  readonly configPath = '~/.gemini/settings.json';

  /**
   * The PTY process instance.
   * @private
   */
  private ptyProcess: pty.IPty | null = null;

  /**
   * Whether login requirement has been detected.
   * @private
   */
  private loginDetected = false;

  /**
   * Accumulated output buffer for pattern matching.
   * @private
   */
  private outputBuffer = '';

  /**
   * Spawns the Gemini CLI in a PTY.
   * 
   * @returns A promise that resolves when Gemini is ready
   * @throws {GeminiNotInstalledError} If Gemini CLI is not installed
   * @throws {GeminiLoginRequiredError} If Gemini requires authentication
   * @throws {Error} If PTY spawn fails
   * 
   * @example
   * ```typescript
   * try {
   *   await agent.spawn();
   *   console.log('Gemini is ready');
   * } catch (error) {
   *   if (error instanceof GeminiNotInstalledError) {
   *     console.log('Please install Gemini CLI');
   *   }
   * }
   * ```
   */
  async spawn(): Promise<void> {
    // Check if gemini is installed
    if (!this.isGeminiInstalled()) {
      throw new GeminiNotInstalledError();
    }

    return new Promise((resolve, reject) => {
      try {
        // Spawn gemini in PTY
        this.ptyProcess = pty.spawn(this.command, [], {
          name: 'xterm-color',
          cols: 120,
          rows: 30,
          cwd: this.config.workingDirectory,
          env: {
            ...process.env,
            ...this.config.env,
          } as Record<string, string>,
        });

        this.running = true;

        // Handle output
        this.ptyProcess.onData((data: string) => {
          this.outputBuffer += data;
          this.emitOutput(data);

          // Check for login requirement
          if (GEMINI_PATTERNS.LOGIN_REQUIRED.test(this.outputBuffer)) {
            if (!this.loginDetected) {
              this.loginDetected = true;
              this.emitError('Gemini requires authentication');
              // Don't reject here - let the caller decide how to handle
            }
          }
        });

        // Handle exit
        this.ptyProcess.onExit(({ exitCode }) => {
          this.running = false;
          this.ptyProcess = null;
          this.emitExit(exitCode);
        });

        // Give gemini time to start, then resolve
        // We resolve quickly so the caller can start interacting
        setTimeout(() => {
          if (this.loginDetected) {
            reject(new GeminiLoginRequiredError());
          } else {
            resolve();
          }
        }, 1000);

      } catch (error) {
        this.running = false;
        reject(error);
      }
    });
  }

  /**
   * Terminates the Gemini CLI process.
   * 
   * @returns A promise that resolves when the process is terminated
   * 
   * @example
   * ```typescript
   * await agent.kill();
   * console.log('Gemini process terminated');
   * ```
   */
  async kill(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.ptyProcess) {
        this.running = false;
        resolve();
        return;
      }

      // Set up exit handler before killing
      const exitHandler = () => {
        this.ptyProcess = null;
        resolve();
      };

      // If already has exit handler, just kill
      this.ptyProcess.onExit(exitHandler);

      // Send SIGTERM
      this.ptyProcess.kill();

      // Force resolve after timeout if process doesn't exit
      setTimeout(() => {
        if (this.ptyProcess) {
          this.ptyProcess = null;
          this.running = false;
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * Sends input text to the Gemini CLI.
   * 
   * @param text - The text to send to Gemini's stdin
   * @throws {Error} If the agent is not running
   * 
   * @example
   * ```typescript
   * agent.sendInput('/waaah-orc\n');
   * ```
   */
  sendInput(text: string): void {
    if (!this.ptyProcess || !this.running) {
      throw new Error('Cannot send input: Gemini agent is not running');
    }
    this.ptyProcess.write(text);
  }

  /**
   * Checks if the Gemini CLI is installed on the system.
   * 
   * @returns True if Gemini is installed and accessible
   * @private
   */
  private isGeminiInstalled(): boolean {
    try {
      execSync('which gemini', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns whether login has been detected as required.
   * 
   * @returns True if Gemini requires login
   * 
   * @example
   * ```typescript
   * if (agent.isLoginRequired()) {
   *   console.log('Please run: gemini auth');
   * }
   * ```
   */
  isLoginRequired(): boolean {
    return this.loginDetected;
  }

  /**
   * Clears the internal output buffer.
   * Useful for resetting pattern detection state.
   */
  clearOutputBuffer(): void {
    this.outputBuffer = '';
    this.loginDetected = false;
  }
}
