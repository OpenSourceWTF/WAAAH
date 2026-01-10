/**
 * PTYManager - PTY lifecycle management with fallback
 * 
 * Uses node-pty when available, falls back to child_process.spawn.
 * Supports heartbeat detection for stuck prompts.
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

export interface PTYSpawnOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  cols?: number;
  rows?: number;
  /** Sanitize output by stripping TUI cursor movement sequences */
  sanitizeOutput?: boolean;
}

export type PTYDataCallback = (data: string) => void;
export type PTYExitCallback = (exitCode: number, signal?: number) => void;

/** Strip TUI cursor movement and screen manipulation sequences */
const sanitizeTuiOutput = (data: string): string => {
  // Strip cursor movement, save/restore, clear line/screen, etc.
  // Preserves colors (SGR sequences like \x1B[32m)
  return data
    .replace(/\x1B\[\?25[hl]/g, '')           // Hide/show cursor
    .replace(/\x1B\[[0-9;]*[ABCDEFGJKST]/g, '') // Cursor movement, clear
    .replace(/\x1B\[s|\x1B\[u/g, '')            // Save/restore cursor
    .replace(/\x1B\[\?1049[hl]/g, '')          // Alternate screen buffer
    .replace(/\x1B\[\d+;\d+H/g, '');            // Cursor positioning
};

export class PTYManager {
  private ptyProcess: import('node-pty').IPty | null = null;
  private childProcess: ChildProcess | null = null;
  private dataCallbacks: PTYDataCallback[] = [];
  private exitCallbacks: PTYExitCallback[] = [];
  private running = false;
  private useNativePty = false;
  private sanitizeOutput = false;
  private childPid: number | null = null;

  public async spawn(options: PTYSpawnOptions): Promise<void> {
    const {
      command,
      args = [],
      cwd = process.cwd(),
      env = process.env as Record<string, string>,
      cols = 80,
      rows = 24,
      sanitizeOutput = false,
    } = options;

    this.sanitizeOutput = sanitizeOutput;

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
        this.childPid = this.ptyProcess.pid;

        this.ptyProcess.onData((data) => {
          const output = this.sanitizeOutput ? sanitizeTuiOutput(data) : data;
          for (const cb of this.dataCallbacks) {
            try { cb(output); } catch { }
          }
        });

        this.ptyProcess.onExit(({ exitCode, signal }) => {
          this.running = false;
          this.childPid = null;
          for (const cb of this.exitCallbacks) {
            try { cb(exitCode, signal); } catch { }
          }
        });

        return;
      } catch (err) {
        console.warn('[PTYManager] node-pty spawn failed, falling back:', err);
      }
    }

    // Fallback using 'script' command to emulate PTY (Linux/macOS)
    // This allows TTY-requiring tools (gemini -i, claude) to work with piped IO
    this.useNativePty = false;

    let spawnCommand = command;
    let spawnArgs = args;

    // Properly escape arguments for the shell
    const escapeArg = (arg: string) => `'${arg.replace(/'/g, "'\\''")}'`;
    const fullCommand = [command, ...args].map(escapeArg).join(' ');

    // Use script command to wrap execution
    // Linux: script -q -e -c "cmd" /dev/null
    // macOS: script -q /dev/null cmd (detected by platform check if needed, simplified for Linux focus)
    if (process.platform === 'linux') {
      spawnCommand = 'script';
      spawnArgs = ['-q', '-e', '-c', fullCommand, '/dev/null'];
    }
    // TODO: macOS support if needed (different flags)

    this.childProcess = spawn(spawnCommand, spawnArgs, {
      cwd,
      env: { ...env, NODE_NO_WARNINGS: '1' } as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      detached: true, // Create new process group for clean shutdown
    });
    this.running = true;
    this.childPid = this.childProcess.pid ?? null;

    // Forward stdout to data callbacks
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      const output = this.sanitizeOutput ? sanitizeTuiOutput(str) : str;
      for (const cb of this.dataCallbacks) {
        try { cb(output); } catch { }
      }
    });

    // Forward stderr to data callbacks too
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      const output = this.sanitizeOutput ? sanitizeTuiOutput(str) : str;
      for (const cb of this.dataCallbacks) {
        try { cb(output); } catch { }
      }
    });

    this.childProcess.on('exit', (code, signal) => {
      this.running = false;
      this.childPid = null;
      for (const cb of this.exitCallbacks) {
        try { cb(code ?? 1, signal ? 0 : undefined); } catch { }
      }
    });

    this.childProcess.on('error', (err) => {
      this.running = false;
      this.childPid = null;
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
  }

  public kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    // Kill entire process group to prevent orphans
    if (this.childPid) {
      try {
        // Negative PID kills the entire process group
        process.kill(-this.childPid, signal);
      } catch {
        // Fallback to direct kill if process group kill fails
        if (this.useNativePty && this.ptyProcess) {
          this.ptyProcess.kill(signal);
        } else if (this.childProcess) {
          this.childProcess.kill(signal);
        }
      }
    }
    this.childPid = null;
  }

  public getPid(): number | null {
    return this.childPid;
  }

  public isRunning(): boolean {
    return this.running;
  }
}
