/**
 * PTYManager - PTY lifecycle management
 * 
 * Handles spawning and managing PTY subprocesses for CLI agents.
 * Uses node-pty for full terminal emulation with cross-platform support (Linux/macOS).
 * 
 * @packageDocumentation
 */

import * as pty from 'node-pty';
import type { IPty } from 'node-pty';

/**
 * Options for spawning a PTY process.
 */
export interface PTYSpawnOptions {
  /** The command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables (defaults to inheriting process.env) */
  env?: Record<string, string | undefined>;
  /** Number of columns (default: 80) */
  cols?: number;
  /** Number of rows (default: 24) */
  rows?: number;
}

/**
 * Callback for PTY data events.
 * @param data - The data received from the PTY
 */
export type PTYDataCallback = (data: string) => void;

/**
 * Callback for PTY exit events.
 * @param exitCode - The exit code of the process
 * @param signal - The signal that terminated the process (if any)
 */
export type PTYExitCallback = (exitCode: number, signal?: number) => void;

/**
 * Manages PTY subprocess lifecycle.
 * 
 * Provides a clean interface for spawning, controlling, and monitoring PTY processes.
 * Supports event-based data and exit handling with multiple callback registration.
 * 
 * @example
 * ```typescript
 * const manager = new PTYManager();
 * 
 * // Register callbacks before spawning
 * manager.onData((data) => console.log('Output:', data));
 * manager.onExit((code) => console.log('Exited with code:', code));
 * 
 * // Spawn the process
 * await manager.spawn({ command: 'gemini', cwd: '/path/to/repo' });
 * 
 * // Interact with the process
 * manager.write('Hello, agent!\n');
 * 
 * // Optionally resize terminal
 * manager.resize(120, 40);
 * 
 * // Clean up when done
 * manager.kill();
 * ```
 */
export class PTYManager {
  /** The underlying node-pty process instance */
  private ptyProcess: IPty | null = null;

  /** Registered data event callbacks */
  private dataCallbacks: PTYDataCallback[] = [];

  /** Registered exit event callbacks */
  private exitCallbacks: PTYExitCallback[] = [];

  /** Disposables for cleanup */
  private disposables: Array<{ dispose: () => void }> = [];

  /** Track running state (set to false on exit) */
  private running = false;

  /**
   * Spawns a new PTY subprocess.
   * 
   * Creates a new pseudo-terminal and spawns the specified command within it.
   * The PTY provides full terminal emulation, supporting interactive programs,
   * ANSI escape sequences, and proper signal handling.
   * 
   * @param options - Configuration options for the PTY spawn
   * @throws Error if the command cannot be spawned (e.g., command not found)
   * @returns Promise that resolves when the PTY is ready
   */
  public async spawn(options: PTYSpawnOptions): Promise<void> {
    const {
      command,
      args = [],
      cwd = process.cwd(),
      env = process.env as Record<string, string>,
      cols = 80,
      rows = 24,
    } = options;

    try {
      // Spawn the PTY process
      this.ptyProcess = pty.spawn(command, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });

      this.running = true;

      // Set up data event forwarding
      const dataDisposable = this.ptyProcess.onData((data) => {
        for (const callback of this.dataCallbacks) {
          try {
            callback(data);
          } catch (err) {
            console.error('Error in PTY data callback:', err);
          }
        }
      });
      this.disposables.push(dataDisposable);

      // Set up exit event forwarding
      const exitDisposable = this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.running = false;
        for (const callback of this.exitCallbacks) {
          try {
            callback(exitCode, signal);
          } catch (err) {
            console.error('Error in PTY exit callback:', err);
          }
        }
        // Clean up disposables after exit
        this.cleanup();
      });
      this.disposables.push(exitDisposable);

    } catch (err) {
      // Handle spawn errors (e.g., command not found)
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to spawn PTY: ${message}`);
    }
  }

  /**
   * Writes data to the PTY stdin.
   * 
   * @param data - Data to write (typically includes newline for command execution)
   * @throws Error if PTY has not been spawned
   */
  public write(data: string): void {
    if (!this.ptyProcess) {
      throw new Error('PTY not spawned');
    }
    this.ptyProcess.write(data);
  }

  /**
   * Registers a callback for PTY data events.
   * 
   * @param callback - Function to call when data is received
   */
  public onData(callback: PTYDataCallback): void {
    this.dataCallbacks.push(callback);
  }

  /**
   * Registers a callback for PTY exit events.
   * 
   * @param callback - Function to call on process exit
   */
  public onExit(callback: PTYExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  /**
   * Resizes the PTY terminal.
   * 
   * @param cols - Number of columns
   * @param rows - Number of rows
   * @throws Error if PTY has not been spawned
   */
  public resize(cols: number, rows: number): void {
    if (!this.ptyProcess) {
      throw new Error('PTY not spawned');
    }
    this.ptyProcess.resize(cols, rows);
  }

  /**
   * Kills the PTY subprocess.
   * 
   * @param signal - Signal to send (default: SIGTERM)
   * @throws Error if PTY has not been spawned
   */
  public kill(signal?: string): void {
    if (!this.ptyProcess) {
      throw new Error('PTY not spawned');
    }
    this.ptyProcess.kill(signal);
  }

  /**
   * Checks if the PTY is still running.
   * 
   * @returns True if the PTY process is active and has not exited
   */
  public isRunning(): boolean {
    return this.running;
  }

  /**
   * Cleans up resources and resets internal state.
   */
  private cleanup(): void {
    for (const disposable of this.disposables) {
      try {
        disposable.dispose();
      } catch {
        // Ignore disposal errors
      }
    }
    this.disposables = [];
    this.ptyProcess = null;
  }
}
