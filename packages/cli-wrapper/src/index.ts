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
    .option('--server <url>', 'WAAAH MCP Server URL', 'http://localhost:3000')
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

  // 6. Build the command based on agent type
  if (agentType === 'gemini') {
    // Gemini has built-in restart - just launch once
    await launchGemini(workspaceRoot, workflow, resume);
  } else {
    // Claude needs manual restart with --resume
    await launchClaudeWithRestart(workspaceRoot, workflow, resume);
  }
}

/**
 * Launch Gemini - simple one-shot, it handles its own restarts
 */
async function launchGemini(workspaceRoot: string, workflow: string, resume: boolean): Promise<void> {
  const prompt = resume
    ? `Resume the /${workflow} workflow. Continue from where you left off.`
    : `Follow the /${workflow} workflow exactly.`;

  console.log('\n' + '─'.repeat(60));
  console.log(`Launching: gemini -i "${prompt.slice(0, 40)}..." --yolo`);
  console.log('─'.repeat(60) + '\n');

  const child = spawn('gemini', ['-i', prompt, '--yolo'], {
    cwd: workspaceRoot,
    stdio: 'inherit',
    env: process.env,
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  return new Promise((resolve) => {
    child.on('exit', (code) => {
      process.exit(code ?? 0);
    });
  });
}

/**
 * Launch Claude with restart support using --resume
 */
async function launchClaudeWithRestart(
  workspaceRoot: string,
  workflow: string,
  resume: boolean,
  maxRestarts: number = 10
): Promise<void> {
  let sessionId: string | undefined;
  let restartCount = 0;

  const prompt = resume
    ? `Resume the /${workflow} workflow. Continue from where you left off.`
    : `Follow the /${workflow} workflow exactly.`;

  while (restartCount < maxRestarts) {
    const args: string[] = ['--dangerously-skip-permissions'];

    // If we have a session ID from previous run, use --resume
    if (sessionId) {
      args.push('--resume', sessionId);
      console.log(`\n🔄 Restarting Claude (attempt ${restartCount + 1}/${maxRestarts})...`);
      console.log(`   Resuming session: ${sessionId}`);
    } else {
      args.push(prompt);
      console.log('\n' + '─'.repeat(60));
      console.log(`Launching: claude ${args.join(' ').slice(0, 50)}...`);
      console.log('─'.repeat(60));
    }
    console.log('');

    const child = spawn('claude', args, {
      cwd: workspaceRoot,
      stdio: 'inherit',
      env: process.env,
    });

    // Track session ID from Claude's output (would need to parse, for now use timestamp)
    if (!sessionId) {
      // Generate a session ID based on timestamp for now
      // TODO: Parse Claude's actual session ID from output
      sessionId = `waaah-${Date.now()}`;
    }

    // Handle signals
    let signalReceived = false;
    const handleSignal = (signal: NodeJS.Signals) => {
      signalReceived = true;
      child.kill(signal);
    };
    process.on('SIGINT', () => handleSignal('SIGINT'));
    process.on('SIGTERM', () => handleSignal('SIGTERM'));

    // Wait for exit
    const exitCode = await new Promise<number>((resolve) => {
      child.on('exit', (code) => resolve(code ?? 0));
    });

    // If user sent signal, exit cleanly
    if (signalReceived) {
      console.log('\n✅ Agent stopped by user.');
      process.exit(0);
    }

    // If clean exit (0), we're done
    if (exitCode === 0) {
      console.log('\n✅ Agent completed successfully.');
      process.exit(0);
    }

    // Otherwise, restart
    restartCount++;
    console.log(`\n⚠️  Claude exited with code ${exitCode}.`);

    if (restartCount >= maxRestarts) {
      console.log(`❌ Max restarts (${maxRestarts}) reached. Exiting.`);
      process.exit(exitCode);
    }

    // Brief delay before restart
    await new Promise(r => setTimeout(r, 2000));
  }
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
