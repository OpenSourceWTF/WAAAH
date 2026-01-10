/**
 * PTYManager - PTY lifecycle management with fallback
 * 
 * Uses node-pty when available, falls back to child_process.spawn.
 * 
 * @packageDocumentation
 */

import { spawn, ChildProcess } from 'child_process';

// Try to load node-pty, fallback to null if unavailable
let pty: typeof import('node-pty') | null = null;
try {
  pty = await import('node-pty');
} catch {
  console.warn('[PTYManager] node-pty not available, using child_process fallback');
}

/**
 * Options for spawning a PTY process.
 */
export interface PTYSpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  cols?: number;
  rows?: number;
}

export type PTYDataCallback = (data: string) => void;
export type PTYExitCallback = (exitCode: number, signal?: number) => void;

/**
 * Manages PTY subprocess lifecycle with fallback to child_process.
 */
export class PTYManager {
  private ptyProcess: import('node-pty').IPty | null = null;
  private childProcess: ChildProcess | null = null;
  private dataCallbacks: PTYDataCallback[] = [];
  private exitCallbacks: PTYExitCallback[] = [];
  private running = false;
  private useNativePty = false;

  /**
   * Spawns a new PTY/child subprocess.
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

    // Try node-pty first
    if (pty) {
      try {
        this.ptyProcess = pty.spawn(command, args, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env,
        });
        this.useNativePty = true;
        this.running = true;

        this.ptyProcess.onData((data) => {
          for (const cb of this.dataCallbacks) {
            try { cb(data); } catch { }
          }
        });

        this.ptyProcess.onExit(({ exitCode, signal }) => {
          this.running = false;
          for (const cb of this.exitCallbacks) {
            try { cb(exitCode, signal); } catch { }
          }
        });

        return;
      } catch (err) {
        console.warn('[PTYManager] node-pty spawn failed, falling back:', err);
      }
    }

    // Fallback to child_process
    this.useNativePty = false;
    this.childProcess = spawn(command, args, {
      cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });
    this.running = true;

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      for (const cb of this.dataCallbacks) {
        try { cb(str); } catch { }
      }
    });

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      for (const cb of this.dataCallbacks) {
        try { cb(str); } catch { }
      }
    });

    this.childProcess.on('exit', (code, signal) => {
      this.running = false;
      for (const cb of this.exitCallbacks) {
        try { cb(code ?? 1, signal ? 0 : undefined); } catch { }
      }
    });

    this.childProcess.on('error', (err) => {
      this.running = false;
      console.error('[PTYManager] Spawn error:', err.message);
      for (const cb of this.exitCallbacks) {
        try { cb(1); } catch { }
      }
    });
  }

  public write(data: string): void {
    if (this.useNativePty && this.ptyProcess) {
      this.ptyProcess.write(data);
    } else if (this.childProcess?.stdin) {
      this.childProcess.stdin.write(data);
    }
  }

  public onData(callback: PTYDataCallback): void {
    this.dataCallbacks.push(callback);
  }

  public onExit(callback: PTYExitCallback): void {
    this.exitCallbacks.push(callback);
  }

  public resize(cols: number, rows: number): void {
    if (this.useNativePty && this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
    // child_process doesn't support resize
  }

  public kill(signal?: string): void {
    if (this.useNativePty && this.ptyProcess) {
      this.ptyProcess.kill(signal);
    } else if (this.childProcess) {
      this.childProcess.kill(signal as NodeJS.Signals | undefined);
    }
  }

  public isRunning(): boolean {
    return this.running;
  }
}
