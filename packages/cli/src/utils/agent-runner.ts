import pty from 'node-pty';
import { SupportedCLI, getConfigPath } from './agent-utils.js';

const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Agent runner with PTY support for Claude/Gemini
 * Uses node-pty for proper terminal emulation
 */
export class AgentRunner {
  private ptyProcess: pty.IPty | null = null;
  private restartCount = 0;
  private lastActivity = Date.now();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private shouldStop = false;

  constructor(
    private cli: SupportedCLI,
    private args: string[],
    private cwd: string,
    private env: NodeJS.ProcessEnv,
    private workflow: string,
    private resume: boolean
  ) { }

  start(): void {
    this.shouldStop = false;
    this.spawnAgent();
    this.startHeartbeat();
    this.setupSignalHandlers();
  }

  private spawnAgent(): void {
    if (this.shouldStop) return;

    let args: string[] = [];

    if (this.cli === 'gemini') {
      // Gemini: uses prompt text, handles its own session
      const prompt = this.resume
        ? `Resume the /${this.workflow} workflow. Continue from where you left off.`
        : `Follow the /${this.workflow} workflow exactly.`;
      args = ['-i', prompt, '--yolo', '--output-format', 'text'];
    } else if (this.cli === 'claude') {
      // Claude: uses --resume or prompt
      const configPath = getConfigPath('claude');

      const promptArgs = this.resume
        ? ['--resume']
        : ['-p', `Follow the /${this.workflow} workflow exactly.`];

      args = [
        ...promptArgs,
        '--dangerously-skip-permissions', // Needed for autonomous op
        '--mcp-config', configPath
      ];
    }

    console.log(`\n🚀 Spawning ${this.cli} with PTY...`);

    // Use node-pty for proper terminal emulation
    this.ptyProcess = pty.spawn(this.cli, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: this.cwd,
      env: { ...this.env, NODE_NO_WARNINGS: '1' } as { [key: string]: string }
    });

    this.lastActivity = Date.now();

    // Pipe PTY output to stdout
    this.ptyProcess.onData((data: string) => {
      process.stdout.write(data);
      this.lastActivity = Date.now();
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      if (this.shouldStop) {
        console.log('\n✅ Agent stopped.');
        process.exit(0);
      }

      if (signal) {
        console.log(`\n⚠️  Agent killed by signal: ${signal}`);
      } else if (exitCode !== 0) {
        console.log(`\n⚠️  Agent exited with code: ${exitCode}`);
      } else {
        console.log('\n✅ Agent exited successfully.');
      }

      this.scheduleRestart();
    });
  }

  private scheduleRestart(): void {
    if (this.shouldStop) return;

    this.restartCount++;
    if (this.restartCount >= MAX_RESTARTS) {
      console.error(`\n❌ Max restarts (${MAX_RESTARTS}) reached. Giving up.`);
      this.cleanup();
      process.exit(1);
    }

    console.log(`\n🔄 Restarting in ${RESTART_DELAY_MS / 1000}s...`);
    this.resume = true; // Always resume after restart
    setTimeout(() => this.spawnAgent(), RESTART_DELAY_MS);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const staleTime = Date.now() - this.lastActivity;
      if (staleTime > HEARTBEAT_TIMEOUT_MS && this.ptyProcess) {
        console.log(`\n⚠️  Agent appears stuck (no activity for ${Math.floor(staleTime / 60000)}m). Restarting...`);
        this.ptyProcess.kill();
        // Exit handler will trigger restart
      }
    }, 60_000); // Check every minute
  }

  private setupSignalHandlers(): void {
    const cleanup = () => {
      console.log('\n🛑 Stopping agent...');
      this.stop();
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  stop(): void {
    this.shouldStop = true;
    this.cleanup();
    if (this.ptyProcess) {
      this.ptyProcess.kill();
    }
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Call this when we detect activity (e.g., from server callbacks)
  heartbeat(): void {
    this.lastActivity = Date.now();
  }
}
