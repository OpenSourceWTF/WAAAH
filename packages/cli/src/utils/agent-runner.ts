import { spawn, ChildProcess } from 'child_process';
import { SupportedCLI } from './agent-utils.js';

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
      args = ['-i', prompt, '--yolo'];
    } else if (this.cli === 'claude') {
      // Claude: uses --resume or prompt
      args = this.resume ? ['--resume'] : ['-p', `Follow the /${this.workflow} workflow exactly.`];
    }

    console.log(`\n🚀 Spawning ${this.cli}...`);
    this.child = spawn(this.cli, args, {
      cwd: this.cwd,
      stdio: 'inherit',
      env: { ...this.env, NODE_NO_WARNINGS: '1' },
      detached: true  // Spawn in new process group for clean cleanup
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
    if (this.child && this.child.pid) {
      // Kill entire process group (negative PID) to clean up all children
      try {
        process.kill(-this.child.pid, 'SIGTERM');
      } catch {
        // Process may already be dead
        this.child.kill('SIGTERM');
      }
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
