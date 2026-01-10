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
  /** Enable auto-continue when agent waits for user input */
  autoRespond?: boolean;
}

export type PTYDataCallback = (data: string) => void;
export type PTYExitCallback = (exitCode: number, signal?: number) => void;

/** Patterns that indicate the agent is waiting for user input */
const WAIT_PATTERNS = [
  /continue\?/i,
  /proceed\?/i,
  /\(y\/n\)/i,
  /press enter/i,
  /waiting for.*input/i,
  /do you want to/i,
  /should I/i,
  /\[Y\/n\]/i,
  /\[yes\/no\]/i,
];

/** Auto-response to send when waiting is detected */
const AUTO_RESPONSE = 'y\n';

export class PTYManager {
  private ptyProcess: import('node-pty').IPty | null = null;
  private childProcess: ChildProcess | null = null;
  private dataCallbacks: PTYDataCallback[] = [];
  private exitCallbacks: PTYExitCallback[] = [];
  private running = false;
  private useNativePty = false;
  private autoRespond = false;
  private lastOutputTime = Date.now();
  private outputBuffer = '';
  private heartbeatInterval: NodeJS.Timeout | null = null;

  public async spawn(options: PTYSpawnOptions): Promise<void> {
    const {
      command,
      args = [],
      cwd = process.cwd(),
      env = process.env as Record<string, string>,
      cols = 80,
      rows = 24,
      autoRespond = true, // Default to auto-respond
    } = options;

    this.autoRespond = autoRespond;

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
          this.handleOutput(data);
          for (const cb of this.dataCallbacks) {
            try { cb(data); } catch { }
          }
        });

        this.ptyProcess.onExit(({ exitCode, signal }) => {
          this.running = false;
          this.stopHeartbeat();
          for (const cb of this.exitCallbacks) {
            try { cb(exitCode, signal); } catch { }
          }
        });

        this.startHeartbeat();
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
      stdio: ['pipe', 'pipe', 'pipe'], // Piped IO now works because 'script' provides the PTY!
      shell: false,
    });
    this.running = true;

    // Forward stdout to data callbacks
    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      this.handleOutput(str);
      for (const cb of this.dataCallbacks) {
        try { cb(str); } catch { }
      }
    });

    // Forward stderr to data callbacks too
    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      this.handleOutput(str);
      for (const cb of this.dataCallbacks) {
        try { cb(str); } catch { }
      }
    });

    this.childProcess.on('exit', (code, signal) => {
      this.running = false;
      this.stopHeartbeat();
      for (const cb of this.exitCallbacks) {
        try { cb(code ?? 1, signal ? 0 : undefined); } catch { }
      }
    });

    this.childProcess.on('error', (err) => {
      this.running = false;
      this.stopHeartbeat();
      console.error('[PTYManager] Spawn error:', err.message);
      for (const cb of this.exitCallbacks) {
        try { cb(1); } catch { }
      }
    });

    this.startHeartbeat();
  }

  private handleOutput(data: string): void {
    this.lastOutputTime = Date.now();
    this.outputBuffer += data;

    // Keep only last 500 chars for pattern matching
    if (this.outputBuffer.length > 500) {
      this.outputBuffer = this.outputBuffer.slice(-500);
    }
  }

  private startHeartbeat(): void {
    // Check every 5 seconds for stuck prompts
    this.heartbeatInterval = setInterval(() => {
      if (!this.running || !this.autoRespond) return;

      // Strip ANSI codes for reliable pattern matching
      // eslint-disable-next-line no-control-regex
      const cleanOutput = this.outputBuffer.replace(/\x1B\[\d+;?\d*m/g, '').replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

      // Check if output matches a wait pattern
      for (const pattern of WAIT_PATTERNS) {
        if (pattern.test(cleanOutput)) {
          console.log('\n[Heartbeat] Detected wait prompt, auto-responding...');
          this.write(AUTO_RESPONSE);
          this.outputBuffer = ''; // Clear buffer after responding
          break;
        }
      }

      // If no output for 2 minutes, send a nudge
      const idleTime = Date.now() - this.lastOutputTime;
      if (idleTime > 120_000) {
        console.log('\n[Heartbeat] Agent idle for 2 minutes, nudging...');
        this.write('continue\n');
        this.lastOutputTime = Date.now();
      }
    }, 5000);
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

  public kill(signal?: string): void {
    this.stopHeartbeat();
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
