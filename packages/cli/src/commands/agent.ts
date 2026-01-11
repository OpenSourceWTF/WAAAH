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
import { handleError } from '../utils/index.js';
import {
  AgentType,
  SUPPORTED_CLIS,
  isSupportedCLI,
  checkCLIInstalled,
  findWorkflowFile,
  findGitRoot,
  ensureMcpConfig
} from '../utils/agent-utils.js';
import { AgentRunner } from '../utils/agent-runner.js';

const DEFAULT_WORKFLOW = 'waaah-orc-loop';
const MAX_RESTARTS = 10;

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
