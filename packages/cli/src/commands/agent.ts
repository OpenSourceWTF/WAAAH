/**
 * waaah agent - Start and manage CLI coding agents
 * 
 * Spawns external CLI coding agents (gemini, claude) with WAAAH MCP integration.
 * 
 * @example
 * ```bash
 * waaah agent --start=gemini
 * waaah agent --start=claude --as=custom-workflow
 * waaah agent --start=gemini --resume
 * ```
 * 
 * @packageDocumentation
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { handleError } from '../utils/index.js';

/**
 * Supported CLI agent types.
 */
const SUPPORTED_CLIS = ['gemini', 'claude'] as const;
type SupportedCLI = typeof SUPPORTED_CLIS[number];

/**
 * Default workflow to use when --as is not specified.
 */
const DEFAULT_WORKFLOW = 'waaah-orc';

/**
 * Check if the specified CLI agent is supported.
 * @param cli - CLI name to check
 * @returns True if supported
 */
function isSupportedCLI(cli: string): cli is SupportedCLI {
  return SUPPORTED_CLIS.includes(cli as SupportedCLI);
}

/**
 * Get the path to a workflow file.
 * @param workflowName - Name of the workflow (without .md extension)
 * @param cwd - Current working directory
 * @returns Absolute path to workflow file or null if not found
 */
function findWorkflowFile(workflowName: string, cwd: string): string | null {
  // Try .agent/workflows/<name>.md
  const workflowPath = path.join(cwd, '.agent', 'workflows', `${workflowName}.md`);
  if (fs.existsSync(workflowPath)) {
    return workflowPath;
  }

  // Try without extension
  const altPath = path.join(cwd, '.agent', 'workflows', workflowName);
  if (fs.existsSync(altPath)) {
    return altPath;
  }

  return null;
}

/**
 * Detect git repository root from a directory.
 * @param cwd - Starting directory
 * @returns Git root path or null
 */
function findGitRoot(cwd: string): string | null {
  let current = cwd;
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

/**
 * Check if a CLI tool is installed and accessible.
 * @param cli - CLI name to check
 * @returns True if installed
 */
async function checkCLIInstalled(cli: SupportedCLI): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync(`which ${cli}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Agent command - start and manage CLI coding agents
 */
export const agentCommand = new Command('agent')
  .description('Start and manage CLI coding agents (gemini, claude) with WAAAH integration')
  .requiredOption('--start <cli>', 'CLI agent to start (gemini, claude)')
  .option('--as <workflow>', 'Workflow to run', DEFAULT_WORKFLOW)
  .option('--resume', 'Resume previous session if available', false)
  .option('--server <url>', 'WAAAH MCP server URL', 'http://localhost:3456')
  .option('--no-mcp', 'Skip MCP configuration check')
  .action(async (options: {
    start: string;
    as: string;
    resume: boolean;
    server: string;
    mcp: boolean;
  }) => {
    try {
      const cli = options.start.toLowerCase();

      // Validate CLI is supported
      if (!isSupportedCLI(cli)) {
        console.error(`❌ Unsupported CLI: ${cli}`);
        console.error(`   Supported CLIs: ${SUPPORTED_CLIS.join(', ')}`);
        process.exit(1);
      }

      // Check if CLI is installed
      const installed = await checkCLIInstalled(cli);
      if (!installed) {
        console.error(`❌ ${cli} CLI not found.`);
        console.error(getInstallInstructions(cli));
        process.exit(1);
      }

      // Detect workspace (git root)
      const cwd = process.cwd();
      const gitRoot = findGitRoot(cwd);
      if (!gitRoot) {
        console.warn('⚠️  Not in a git repository. Some features may not work correctly.');
        console.warn('   Consider running: git init');
      }
      const workspaceRoot = gitRoot || cwd;

      // Find workflow file
      const workflowPath = findWorkflowFile(options.as, workspaceRoot);
      if (!workflowPath) {
        console.error(`❌ Workflow not found: ${options.as}`);
        console.error(`   Expected: ${workspaceRoot}/.agent/workflows/${options.as}.md`);
        process.exit(1);
      }

      // Read workflow content
      const workflowContent = fs.readFileSync(workflowPath, 'utf-8');

      console.log('🚀 WAAAH Agent Wrapper');
      console.log(`   CLI: ${cli}`);
      console.log(`   Workflow: ${options.as}`);
      console.log(`   Workspace: ${workspaceRoot}`);
      console.log(`   Resume: ${options.resume}`);
      console.log(`   MCP Server: ${options.server}`);
      console.log('');

      // TODO: Check MCP configuration (requires cli-wrapper package implementation)
      if (options.mcp) {
        console.log('🔧 Checking MCP configuration...');
        // This will be implemented when MCPInjector is available
        console.log('   MCP configuration check not yet implemented.');
      }

      // TODO: Start agent with PTY (requires cli-wrapper package implementation)
      console.log('');
      console.log('⚠️  Agent spawning not yet implemented.');
      console.log('   The following would be executed:');
      console.log(`   - Spawn ${cli} CLI in PTY`);
      console.log(`   - Inject workflow: @[/${options.as}]`);
      console.log(`   - Monitor output for loop exit`);
      console.log(`   - Auto-restart on crash or loop exit`);
      console.log('');
      console.log('   Waiting for cli-wrapper package implementation (T-4, T-8).');

      // Preview workflow
      console.log('');
      console.log('📄 Workflow preview:');
      console.log('─'.repeat(60));
      const preview = workflowContent.substring(0, 500);
      console.log(preview);
      if (workflowContent.length > 500) {
        console.log('... (truncated)');
      }
      console.log('─'.repeat(60));

    } catch (error) {
      handleError(error);
    }
  });

/**
 * Get installation instructions for a CLI.
 * @param cli - CLI name
 * @returns Installation instructions string
 */
function getInstallInstructions(cli: SupportedCLI): string {
  switch (cli) {
    case 'gemini':
      return '   Install with: npm install -g @google/gemini-cli\n   Then run: gemini auth';
    case 'claude':
      return '   Install Claude Desktop from: https://claude.ai/desktop\n   Or use: npm install -g @anthropic-ai/claude-cli';
    default:
      return '   Please install the CLI and ensure it is in your PATH.';
  }
}
