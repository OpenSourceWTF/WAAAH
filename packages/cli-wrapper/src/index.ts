#!/usr/bin/env node
/**
 * CLI Agent Launcher - Simple entry point
 * 
 * Sets up MCP config and launches native CLI agents (gemini, claude).
 * Uses exec to replace the process, giving the user the native experience.
 * 
 * @packageDocumentation
 */

// Suppress punycode deprecation warning
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name !== 'DeprecationWarning' || !warning.message.includes('punycode')) {
    console.warn(warning);
  }
});

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn } from 'child_process';

import { GeminiAgent } from './agents/gemini.js';
import { ClaudeAgent } from './agents/claude.js';
import { MCPInjector } from './config/mcp-injector.js';
import { GitUtils } from './utils/git.js';
import { WorkflowInjector } from './workflow/injector.js';

// Re-exports for library usage
export { BaseAgent } from './agents/base.js';
export { GeminiAgent } from './agents/gemini.js';
export { ClaudeAgent } from './agents/claude.js';
export { PTYManager } from './pty/manager.js';
export { SessionManager } from './session/manager.js';
export { CrashRecovery, RecoveryStatus } from './session/recovery.js';
export { MCPInjector } from './config/mcp-injector.js';
export { GitUtils } from './utils/git.js';
export { Logger } from './utils/logger.js';
export { LoopDetector, LoopState } from './monitor/loop-detector.js';

// Doctor Agent module
export {
  GitPoller,
  type DoctorState,
  type ChangeCheckResult,
} from './doctor/index.js';

/**
 * Main entry point for the CLI wrapper.
 */
export async function main(): Promise<void> {
  const program = new Command();
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url).pathname, 'utf-8'));

  program
    .name('waaah-agent')
    .description('WAAAH CLI Agent Launcher - Start agents with proper MCP config')
    .version(pkg.version)
    .option('--start <agent>', 'Agent to start (gemini, claude)')
    .option('--as <workflow>', 'Workflow to execute (default: waaah-orc)', 'waaah-orc')
    .option('--resume', 'Resume previous session if available')
    .option('--skip-mcp', 'Skip MCP configuration check', false)
    .option('--server <url>', 'WAAAH MCP Server URL', 'http://localhost:3456')
    .action(async (options) => {
      try {
        await launchAgent(options);
      } catch (error) {
        console.error('\n❌ Fatal Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

async function launchAgent(options: any) {
  const { start: agentType, as: workflow, resume, skipMcp, server } = options;

  if (!agentType) {
    console.error('❌ Error: --start <agent> is required (gemini or claude)');
    process.exit(1);
  }

  if (!['gemini', 'claude'].includes(agentType)) {
    console.error(`❌ Error: Unsupported agent type: ${agentType}`);
    process.exit(1);
  }

  const cwd = process.cwd();

  // 1. Print banner
  console.log('🤖 WAAAH Agent Launcher');
  console.log(`   Agent: ${agentType}`);
  console.log(`   Workflow: ${workflow}`);

  // 2. Workspace Detection
  const git = new GitUtils();
  const workspaceInfo = await git.detectWorkspaceInteractive(cwd, {
    warnIfNotRepo: true,
    offerInit: false
  });
  const workspaceRoot = workspaceInfo.path;
  console.log(`   Workspace: ${workspaceRoot}`);

  // 3. Agent Pre-flight Checks
  const agentConfig = { workflow, resume: !!resume, workspaceRoot };
  const agent = agentType === 'gemini'
    ? new GeminiAgent(agentConfig)
    : new ClaudeAgent(agentConfig);

  if (!(await agent.checkInstalled())) {
    console.error(`\n❌ ${agentType} CLI is not installed.`);
    console.log(agent.getInstallInstructions());
    process.exit(1);
  }

  if (!(await agent.checkAuthenticated())) {
    console.error(`\n❌ ${agentType} CLI is not authenticated.`);
    process.exit(1);
  }

  // 4. MCP Configuration
  if (!skipMcp) {
    const injector = new MCPInjector();
    const hasConfig = await injector.hasWaaahConfig(agentType as 'gemini' | 'claude');

    if (!hasConfig) {
      console.log('\n⚙️  Configuring WAAAH MCP...');
      await injector.inject(agentType as 'gemini' | 'claude', { url: server });
      console.log('✅ MCP configured.');
    }
  }

  // 5. Check workflow exists
  const workflowInjector = new WorkflowInjector(workspaceRoot);
  const workflowExists = await workflowInjector.exists(workflow);

  if (!workflowExists) {
    console.warn(`\n⚠️  Workflow '${workflow}' not found in .agent/workflows/`);
  }

  // 6. Build the command
  const prompt = resume
    ? `Resume the /${workflow} workflow. Continue from where you left off.`
    : `Follow the /${workflow} workflow exactly.`;

  let command: string;
  let args: string[];

  if (agentType === 'gemini') {
    command = 'gemini';
    args = ['-i', prompt, '--yolo'];
  } else {
    command = 'claude';
    args = ['--dangerously-skip-permissions', prompt];
  }

  // 7. Launch the native CLI (replace this process)
  console.log('\n' + '─'.repeat(60));
  console.log(`Launching: ${command} ${args.join(' ')}`);
  console.log('─'.repeat(60) + '\n');

  // Use spawn with stdio inherit to give user native experience
  // Then exit when the child exits
  const child = spawn(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  });

  // Forward signals to child
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  // Exit with child's exit code
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
