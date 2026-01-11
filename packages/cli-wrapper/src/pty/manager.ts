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
  private lastDataTimestamp = Date.now();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public async spawn(options: PTYSpawnOptions): Promise<void> {
    const {
      command,
      args = [],
      cwd = process.cwd(),
      env = process.env as Record<string, string | undefined>,
      cols = 80,
      rows = 24,
      sanitizeOutput = false,
    } = options;

    this.sanitizeOutput = sanitizeOutput;

    if (pty) {
      const success = await this.spawnNative(command, args, cwd, env as Record<string, string>, cols, rows);
      if (success) return;
    }

    await this.spawnFallback(command, args, cwd, env);
  }

  private notifyData(data: string): void {
    this.dataCallbacks.forEach(cb => { try { cb(data); } catch { } });
  }

  private notifyExit(code: number, signal?: number): void {
    this.exitCallbacks.forEach(cb => { try { cb(code, signal); } catch { } });
  }

  private async spawnNative(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    cols: number,
    rows: number
  ): Promise<boolean> {
    try {
      this.ptyProcess = pty!.spawn(command, args, {
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
        this.lastDataTimestamp = Date.now();
        const output = this.sanitizeOutput ? sanitizeTuiOutput(data) : data;
        this.notifyData(output);
      });

      this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.stopHeartbeat();
        this.running = false;
        this.childPid = null;
        this.notifyExit(exitCode, signal);
      });

      this.startHeartbeat();
      return true;
    } catch (err) {
      console.warn('[PTYManager] node-pty spawn failed, falling back:', err);
      return false;
    }
  }

  private getFallbackCommand(command: string, args: string[]): { cmd: string, args: string[] } {
    const escapeArg = (arg: string) => `'${arg.replace(/'/g, "'\\''")}'`;
    const fullCommand = [command, ...args].map(escapeArg).join(' ');

    if (process.platform === 'linux') {
      return { cmd: 'script', args: ['-q', '-e', '-c', fullCommand, '/dev/null'] };
    }
    
    if (process.platform === 'darwin') {
      return { cmd: 'script', args: ['-q', '/dev/null', ...[command, ...args]] };
    }

    return { cmd: command, args: args };
  }

  private setupChildProcessListeners(): void {
    if (!this.childProcess) return;

    const handleData = (data: Buffer) => {
      this.lastDataTimestamp = Date.now();
      const str = data.toString();
      const output = this.sanitizeOutput ? sanitizeTuiOutput(str) : str;
      this.notifyData(output);
    };

    this.childProcess.stdout?.on('data', handleData);
    this.childProcess.stderr?.on('data', handleData);

    this.childProcess.on('exit', (code, signal) => {
      this.stopHeartbeat();
      this.running = false;
      this.childPid = null;
      this.notifyExit(code ?? 1, signal ? 0 : undefined);
    });

    this.childProcess.on('error', (err) => {
      this.stopHeartbeat();
      this.running = false;
      this.childPid = null;
      console.error('[PTYManager] Spawn error:', err.message);
      this.notifyExit(1);
    });
  }

  private async spawnFallback(
    command: string,
    args: string[],
    cwd: string,
    env: Record<string, string | undefined>
  ): Promise<void> {
    this.useNativePty = false;
    const { cmd, args: spawnArgs } = this.getFallbackCommand(command, args);

    this.childProcess = spawn(cmd, spawnArgs, {
      cwd,
      env: { ...env, NODE_NO_WARNINGS: '1' } as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      detached: true,
    });

    this.running = true;
    this.childPid = this.childProcess.pid ?? null;

    this.setupChildProcessListeners();
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    this.lastDataTimestamp = Date.now();
    this.heartbeatInterval = setInterval(() => {
      const inactiveMs = Date.now() - this.lastDataTimestamp;
      if (inactiveMs > 300000) { // 5 minutes of silence
        console.warn('[PTYManager] Heartbeat timeout: No data for 5 minutes');
        // We don't kill automatically, but we could emit an event or log it
      }
    }, 60000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
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
    this.stopHeartbeat();
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
