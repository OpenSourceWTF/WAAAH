/**
 * waaah agent - Start CLI coding agents with WAAAH MCP integration
 * 
 * Simple preflight + handoff: checks prerequisites, ensures MCP config,
 * then executes the CLI directly (no process management).
 * 
 * @example
 * ```bash
 * waaah agent --start=gemini
 * waaah agent --start=gemini --as=waaah-orc-agent
 * waaah agent --start=claude --resume
 * waaah agent --start=gemini --dry-run
 * ```
 */
import { Command } from 'commander';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { getAdapter, getSupportedCLIs, isSupportedCLI, ExitCode } from '../adapters/index.js';

const DEFAULT_WORKFLOW = 'waaah-orc-agent';
const DEFAULT_SERVER = 'http://localhost:3000';

/** Find git root from cwd */
function findGitRoot(cwd: string): string | null {
  let current = cwd;
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    current = path.dirname(current);
  }
  return null;
}

/** Find workflow file */
function findWorkflowFile(name: string, cwd: string): string | null {
  const workflowPath = path.join(cwd, '.agent', 'workflows', `${name}.md`);
  if (fs.existsSync(workflowPath)) return workflowPath;
  return null;
}

/** Prompt for yes/no */
function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/** Log with optional verbose flag */
function log(message: string, verbose: boolean, alwaysShow = false): void {
  if (verbose || alwaysShow) {
    console.log(message);
  }
}

export const agentCommand = new Command('agent')
  .description('Start CLI coding agents with WAAAH MCP integration')
  .requiredOption('--start <cli>', `CLI to start (${getSupportedCLIs().join(', ')})`)
  .option('--as <workflow>', 'Workflow to run', DEFAULT_WORKFLOW)
  .option('--resume', 'Resume previous session', false)
  .option('--server <url>', 'WAAAH MCP Server URL', DEFAULT_SERVER)
  .option('--dry-run', 'Print command without executing', false)
  .option('--verbose', 'Show detailed preflight checks', false)
  .action(async (options: {
    start: string;
    as: string;
    resume: boolean;
    server: string;
    dryRun: boolean;
    verbose: boolean;
  }) => {
    const { start: cli, as: workflow, resume, server, dryRun, verbose } = options;

    // Get adapter
    if (!isSupportedCLI(cli)) {
      console.error(`❌ Unsupported CLI: ${cli}`);
      console.error(`   Supported: ${getSupportedCLIs().join(', ')}`);
      process.exit(ExitCode.UNKNOWN_CLI);
    }

    const adapter = getAdapter(cli)!;
    log(`🔍 Using ${adapter.name} adapter`, verbose);

    // Check CLI installed
    log(`   Checking if ${adapter.name} is installed...`, verbose);
    const installed = await adapter.checkInstalled();
    if (!installed) {
      console.error(`❌ ${adapter.name} CLI not found. Install it first.`);
      process.exit(ExitCode.CLI_NOT_FOUND);
    }
    log(`   ✅ ${adapter.name} installed`, verbose);

    // Check auth
    log(`   Checking authentication...`, verbose);
    const authed = await adapter.checkAuth();
    if (!authed) {
      console.error(`❌ ${adapter.name} requires authentication. Run: ${adapter.name} auth`);
      process.exit(ExitCode.AUTH_FAILED);
    }
    log(`   ✅ Authenticated`, verbose);

    // Find workspace
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    const workspaceRoot = gitRoot || cwd;
    log(`   Workspace: ${workspaceRoot}`, verbose);

    // Check workflow exists
    const workflowPath = findWorkflowFile(workflow, workspaceRoot);
    if (!workflowPath) {
      console.error(`❌ Workflow not found: ${workflow}`);
      console.error(`   Expected: ${workspaceRoot}/.agent/workflows/${workflow}.md`);
      process.exit(ExitCode.WORKFLOW_NOT_FOUND);
    }
    log(`   ✅ Workflow found: ${workflowPath}`, verbose);

    // Check/configure MCP
    log(`   Checking MCP configuration...`, verbose);
    const mcpConfig = adapter.getMcpConfig();

    if (!mcpConfig) {
      console.log(`\n⚙️  WAAAH MCP not configured for ${adapter.name}.`);
      const configure = await promptYesNo(`   Configure now? (y/n): `);
      if (configure) {
        adapter.writeMcpConfig(server, '');
        console.log(`   ✅ MCP configured (${server})`);
      } else {
        console.error(`   ❌ MCP configuration required.`);
        process.exit(ExitCode.MCP_CONFIG_ERROR);
      }
    } else if (mcpConfig.url !== server) {
      console.log(`\n⚠️  MCP URL mismatch: ${mcpConfig.url} vs ${server}`);
      const update = await promptYesNo(`   Update config? (y/n): `);
      if (update) {
        adapter.writeMcpConfig(server, '');
        console.log(`   ✅ MCP updated (${server})`);
      }
    } else if (!mcpConfig.hasApiKey) {
      log(`   ⚠️  MCP missing API key, updating...`, verbose, true);
      adapter.writeMcpConfig(server, '');
      log(`   ✅ MCP updated with API key`, verbose);
    } else {
      log(`   ✅ MCP configured (${server})`, verbose);
    }

    // Build args
    const args = adapter.buildArgs(workflow, resume);

    // Dry run mode
    if (dryRun) {
      console.log(`\n🔍 Dry run mode - would execute:`);
      console.log(`   ${adapter.name} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
      console.log(`   cwd: ${workspaceRoot}`);
      process.exit(ExitCode.SUCCESS);
    }

    // Execute
    console.log(`\n🚀 Starting ${adapter.name}...`);
    if (verbose) {
      console.log(`   ${adapter.name} ${args.join(' ')}`);
    }

    const result = spawnSync(adapter.name, args, {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    // Exit with same code as child
    process.exit(result.status ?? ExitCode.AGENT_ERROR);
  });
