import { spawn, ChildProcess } from 'child_process';
import { SupportedCLI, getConfigPath } from './agent-utils.js';

const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Agent runner with restart and heartbeat support
 */
export class AgentRunner {
  private child: ChildProcess | null = null;
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
      // Claude: uses --resume for resume, or positional prompt for new session
      // NOTE: -p flag is "print mode" (non-interactive) - DO NOT use for interactive agents
      const configPath = getConfigPath('claude');

      if (this.resume) {
        args = [
          '--resume',
          '--dangerously-skip-permissions',
          '--mcp-config', configPath
        ];
      } else {
        // Pass prompt as FIRST positional argument for interactive mode
        // Must be FIRST because --mcp-config consumes remaining args
        const prompt = `Follow the /${this.workflow} workflow exactly.`;
        args = [
          prompt,  // Prompt MUST be first
          '--dangerously-skip-permissions',
          '--mcp-config', configPath
        ];
      }
    }

    console.log(`\n🚀 Spawning ${this.cli}...`);

    // Use 'inherit' for all stdio to pass through TTY
    this.child = spawn(this.cli, args, {
      cwd: this.cwd,
      stdio: 'inherit',
      env: { ...this.env, NODE_NO_WARNINGS: '1', FORCE_COLOR: '1' }
    });

    this.lastActivity = Date.now();

    this.child.on('exit', (code, signal) => {
      if (this.shouldStop) {
        console.log('\n✅ Agent stopped.');
        process.exit(0);
      }

      if (signal) {
        console.log(`\n⚠️  Agent killed by signal: ${signal}`);
      } else if (code !== 0) {
        console.log(`\n⚠️  Agent exited with code: ${code}`);
      } else {
        console.log('\n✅ Agent exited successfully.');
      }

      this.scheduleRestart();
    });

    this.child.on('error', (err) => {
      console.error(`\n❌ Failed to spawn ${this.cli}: ${err.message}`);
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
      if (staleTime > HEARTBEAT_TIMEOUT_MS && this.child) {
        console.log(`\n⚠️  Agent appears stuck (no activity for ${Math.floor(staleTime / 60000)}m). Restarting...`);
        this.child.kill('SIGTERM');
      }
    }, 60_000);
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
    if (this.child) {
      this.child.kill('SIGTERM');
    }
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  heartbeat(): void {
    this.lastActivity = Date.now();
  }
}
