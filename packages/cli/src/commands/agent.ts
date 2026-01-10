/**
 * waaah agent - Start and manage CLI coding agents
 * 
 * Spawns external CLI coding agents (gemini, claude) with WAAAH MCP integration.
 * Features: auto-restart, heartbeat monitoring, resume support.
 * 
 * @example
 * ```bash
 * waaah agent --start=gemini
 * waaah agent --start=gemini --as=waaah-orc-loop
 * waaah agent --start=gemini --resume
 * ```
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { spawn, ChildProcess, execSync } from 'child_process';
import { handleError } from '../utils/index.js';

const SUPPORTED_CLIS = ['gemini', 'claude'] as const;
type SupportedCLI = typeof SUPPORTED_CLIS[number];

const DEFAULT_WORKFLOW = 'waaah-orc-loop';
const MAX_RESTARTS = 10;
const RESTART_DELAY_MS = 2000;
const HEARTBEAT_TIMEOUT_MS = 300_000; // 5 minutes

function isSupportedCLI(cli: string): cli is SupportedCLI {
  return SUPPORTED_CLIS.includes(cli as SupportedCLI);
}

function findWorkflowFile(workflowName: string, cwd: string): string | null {
  const workflowPath = path.join(cwd, '.agent', 'workflows', `${workflowName}.md`);
  if (fs.existsSync(workflowPath)) return workflowPath;

  // Try without .md
  const altPath = path.join(cwd, '.agent', 'workflows', workflowName);
  if (fs.existsSync(altPath)) return altPath;

  return null;
}

function findGitRoot(cwd: string): string | null {
  let current = cwd;
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    current = path.dirname(current);
  }
  return null;
}

async function checkCLIInstalled(cli: SupportedCLI): Promise<boolean> {
  try {
    execSync(`which ${cli}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// MCP Configuration
// ─────────────────────────────────────────────────────────────

type AgentType = 'gemini' | 'claude';

function getConfigPath(agentType: AgentType): string {
  const home = process.env.HOME || '';
  return agentType === 'gemini'
    ? `${home}/.gemini/settings.json`
    : `${home}/.claude/claude_desktop_config.json`;
}

function getMcpConfig(agentType: AgentType): { url: string } | null {
  try {
    const configPath = getConfigPath(agentType);
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    const waaah = config.mcpServers?.waaah;
    if (!waaah) return null;

    // Extract URL from args
    if (waaah.args) {
      const urlIdx = waaah.args.indexOf('--url');
      if (urlIdx !== -1 && waaah.args[urlIdx + 1]) {
        return { url: waaah.args[urlIdx + 1] };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isProxyInstalled(): boolean {
  try {
    execSync('which waaah-proxy', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

function promptChoice(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function configureMcp(agentType: AgentType, serverUrl: string): Promise<void> {
  // Check if proxy is installed
  const installed = isProxyInstalled();
  let proxyMethod: 'global' | 'npx' = 'global';

  if (!installed) {
    console.log('\n   ⚠️  waaah-proxy is not globally installed.');
    console.log('   1. Install globally now (npm install -g @opensourcewtf/waaah-mcp-proxy)');
    console.log('   2. Use npx each time (slower)');
    const choice = await promptChoice('   Choose (1 or 2) [default: 1]: ');

    if (choice === '2') {
      proxyMethod = 'npx';
    } else {
      console.log('   📦 Installing waaah-proxy globally...');
      try {
        execSync('npm install -g @opensourcewtf/waaah-mcp-proxy', { stdio: 'inherit' });
        console.log('   ✅ Installed!');
      } catch {
        console.log('   ❌ Install failed. Using npx.');
        proxyMethod = 'npx';
      }
    }
  } else {
    console.log('   ✅ waaah-proxy is installed globally');
  }

  // Build config
  const configPath = getConfigPath(agentType);
  let config: any = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch { /* new file */ }

  config.mcpServers = config.mcpServers || {};

  if (proxyMethod === 'global') {
    config.mcpServers.waaah = {
      command: 'waaah-proxy',
      args: ['--url', serverUrl]
    };
  } else {
    config.mcpServers.waaah = {
      command: 'npx',
      args: ['-y', '@opensourcewtf/waaah-mcp-proxy', '--url', serverUrl]
    };
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`   ✅ MCP configured (${serverUrl})`);
}

async function ensureMcpConfig(agentType: AgentType, serverUrl: string): Promise<void> {
  const current = getMcpConfig(agentType);

  if (!current) {
    console.log('\n⚙️  WAAAH MCP not configured.');
    await configureMcp(agentType, serverUrl);
  } else if (current.url !== serverUrl) {
    console.log(`\n⚠️  MCP URL mismatch: ${current.url} vs ${serverUrl}`);
    const update = await promptYesNo('   Update config? (y/n): ');
    if (update) {
      await configureMcp(agentType, serverUrl);
    }
  } else {
    console.log(`\n✅ MCP configured (${serverUrl})`);
  }
}

/**
 * Agent runner with restart and heartbeat support
 */
class AgentRunner {
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
      // Claude: use --continue for restarts, initial prompt for first run
      if (this.resume) {
        // Continue most recent conversation
        args = ['--dangerously-skip-permissions', '--continue'];
      } else {
        const prompt = `Follow the /${this.workflow} workflow exactly.`;
        args = ['--dangerously-skip-permissions', prompt];
      }
    }

    console.log(`\n🚀 Starting ${this.cli} agent (attempt ${this.restartCount + 1}/${MAX_RESTARTS})...`);
    console.log(`   Workflow: ${this.workflow}`);
    console.log(`   Resume: ${this.resume}`);
    console.log('');

    this.child = spawn(this.cli, args, {
      cwd: this.cwd,
      stdio: 'inherit',
      env: { ...this.env, NODE_NO_WARNINGS: '1' }
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

  // Call this when we detect activity (e.g., from server callbacks)
  heartbeat(): void {
    this.lastActivity = Date.now();
  }
}

export const agentCommand = new Command('agent')
  .description('Start and manage CLI coding agents with auto-restart and heartbeat')
  .requiredOption('--start <cli>', 'CLI agent to start (gemini, claude)')
  .option('--as <workflow>', 'Workflow to run', DEFAULT_WORKFLOW)
  .option('--resume', 'Resume previous session', false)
  .option('--max-restarts <n>', 'Maximum restart attempts', String(MAX_RESTARTS))
  .option('--server <url>', 'WAAAH MCP Server URL', 'http://localhost:3000')
  .action(async (options: {
    start: string;
    as: string;
    resume: boolean;
    maxRestarts: string;
    server: string;
  }) => {
    try {
      const cli = options.start.toLowerCase();

      if (!isSupportedCLI(cli)) {
        console.error(`❌ Unsupported CLI: ${cli}`);
        console.error(`   Supported: ${SUPPORTED_CLIS.join(', ')}`);
        process.exit(1);
      }

      const installed = await checkCLIInstalled(cli);
      if (!installed) {
        console.error(`❌ ${cli} CLI not found. Install it first.`);
        process.exit(1);
      }

      const cwd = process.cwd();
      const gitRoot = findGitRoot(cwd);
      const workspaceRoot = gitRoot || cwd;

      const workflowPath = findWorkflowFile(options.as, workspaceRoot);
      if (!workflowPath) {
        console.error(`❌ Workflow not found: ${options.as}`);
        console.error(`   Expected: ${workspaceRoot}/.agent/workflows/${options.as}.md`);
        process.exit(1);
      }

      console.log('🤖 WAAAH Agent Wrapper');
      console.log(`   CLI: ${cli}`);
      console.log(`   Workflow: ${options.as}`);
      console.log(`   Workspace: ${workspaceRoot}`);
      console.log(`   Server: ${options.server}`);

      // Check/configure MCP
      await ensureMcpConfig(cli as AgentType, options.server);

      console.log(`\n   Max restarts: ${options.maxRestarts}`);

      const runner = new AgentRunner(
        cli,
        [workspaceRoot],
        workspaceRoot,
        { ...process.env },
        options.as,
        options.resume
      );

      runner.start();

    } catch (error) {
      handleError(error);
    }
  });

function getInstallInstructions(cli: SupportedCLI): string {
  switch (cli) {
    case 'gemini':
      return '   Install: npm install -g @google/gemini-cli';
    case 'claude':
      return '   Install Claude Desktop or: npm install -g @anthropic-ai/claude-cli';
  }
}
