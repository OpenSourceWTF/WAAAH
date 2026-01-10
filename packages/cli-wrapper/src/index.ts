#!/usr/bin/env node
/**
 * CLI Agent Wrapper - Entry point
 * 
 * Spawns and manages external CLI coding agents (gemini, claude) with WAAAH MCP integration.
 * 
 * @packageDocumentation
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';

import { GeminiAgent } from './agents/gemini.js';
import { ClaudeAgent } from './agents/claude.js';
import { PTYManager } from './pty/manager.js';
import { SessionManager } from './session/manager.js';
import { CrashRecovery } from './session/recovery.js';
import { MCPInjector } from './config/mcp-injector.js';
import { GitUtils } from './utils/git.js';
import { GracefulShutdown } from './utils/graceful-shutdown.js';
import { WorkflowInjector } from './workflow/injector.js';
import { LoopDetector } from './monitor/loop-detector.js';
import { RestartHandler } from './monitor/restart-handler.js';

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
    .description('WAAAH CLI Agent Wrapper - Run autonomous coding agents')
    .version(pkg.version)
    .option('--start <agent>', 'Agent to start (gemini, claude)')
    .option('--as <workflow>', 'Workflow to execute (default: waaah-orc)', 'waaah-orc')
    .option('--resume', 'Resume previous session if available')
    .option('--skip-mcp', 'Skip MCP configuration check', false)
    .option('--server <url>', 'WAAAH MCP Server URL', 'http://localhost:3456')
    .action(async (options) => {
      try {
        await runAgent(options);
      } catch (error) {
        console.error('\n❌ Fatal Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

async function runAgent(options: any) {
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
  console.log(`🚀 Starting WAAAH Agent Wrapper (${agentType})...`);

  // 1. Workspace Detection
  const git = new GitUtils();
  const workspaceInfo = await git.detectWorkspaceInteractive(cwd, {
    warnIfNotRepo: true,
    offerInit: true
  });
  const workspaceRoot = workspaceInfo.path;
  console.log(`📂 Workspace: ${workspaceRoot}`);

  // 2. Session Management & Recovery
  const sessionManager = new SessionManager(workspaceRoot);
  const recovery = new CrashRecovery(workspaceRoot);

  if (resume) {
    console.log('🔄 Attempting to resume previous session...');
    const result = await recovery.resumeSession(options.resume === true ? undefined : options.resume); // resume can be flag or ID if we enhanced args
    if (result.status === 'resumed' && result.session) {
      console.log(`✅ Resumed session: ${result.session.id}`);
      // TODO: Load previous state/logs if needed
    } else {
      console.log('⚠️ Could not resume session. Starting fresh.');
    }
  } else {
    // Check for crashed sessions
    const crashed = recovery.detectCrashedSession();
    if (crashed) {
      console.log(recovery.getRecoveryPrompt(crashed));
      // In non-interactive mode or simple CLI, we might skip this confirm for now or implement strict input
      // For now, simple logic: if they didn't ask to resume, we start fresh but warn.
      console.log('   (Run with --resume to recover this session)');
    }
  }

  // Create new session if not resuming
  const session = await sessionManager.create(agentType, workflow);
  console.log(`📝 Session ID: ${session.id}`);

  // 3. Agent Initialization
  const agentConfig = {
    workflow,
    resume: !!resume,
    workspaceRoot
  };

  let agent;
  if (agentType === 'gemini') {
    agent = new GeminiAgent(agentConfig);
  } else {
    agent = new ClaudeAgent(agentConfig);
  }

  // 4. Pre-flight Checks
  console.log('🔍 Performing pre-flight checks...');

  if (!(await agent.checkInstalled())) {
    console.error(`❌ ${agentType} CLI is not installed.`);
    if (agentType === 'gemini') {
      console.log((agent as GeminiAgent).getInstallInstructions());
    } else {
      console.log((agent as ClaudeAgent).getInstallInstructions());
    }
    process.exit(1);
  }

  if (!(await agent.checkAuthenticated())) {
    console.error(`❌ ${agentType} CLI is not authenticated.`);
    process.exit(1);
  }

  // 5. MCP Configuration
  if (!skipMcp) {
    const injector = new MCPInjector();
    const hasConfig = await injector.hasWaaahConfig(agentType as 'gemini' | 'claude');

    if (!hasConfig) {
      console.log('⚙️  Configuring WAAAH MCP...');
      await injector.inject(agentType as 'gemini' | 'claude', { url: server });
      console.log('✅ MCP configured.');
    } else {
      console.log('✅ MCP Configuration found.');
    }
  }

  // 6. Workflow Injection Setup
  const workflowInjector = new WorkflowInjector(workspaceRoot);
  const workflowExists = await workflowInjector.exists(workflow);

  if (!workflowExists) {
    console.warn(`⚠️  Workflow '${workflow}' not found in .agent/workflows/`);
    console.warn(`   Agent will start without initial workflow prompt.`);
  }

  // 7. Loop & Restart Monitoring
  const loopDetector = new LoopDetector();
  const restartHandler = new RestartHandler({
    onLog: (msg) => console.log(`[Monitor] ${msg}`),
    onRestart: async (event) => {
      console.log(`\n🔄 Restarting agent (Attempt ${event.attempt})...`);
      // Kill current, wait, respawn logic would go here
      // For MVP V1 of this CLI, we might just exit and let the user restart, 
      // or implement the full respawn loop.
      // Implementing full respawn requires wrapping the spawn logic in a loop.
      // For now, we'll log it.
    }
  });

  // 8. Graceful Shutdown
  const shutdown = new GracefulShutdown({
    sessionManager,
    killAgent: async () => {
      // We need access to the PTY process to kill it. 
      // The BaseAgent interface needs a 'stop' method.
      // We'll trust whatever agent implementation to kill itself.
    },
    getSessionState: () => session
  });
  shutdown.install();

  // 9. Start the Agent with restart support
  console.log('');
  console.log(`🤖 Starting ${agentType} agent...`);
  console.log(`   Workflow: ${workflow}`);
  console.log(`   Restart on exit: enabled (max 10)`);
  console.log('');

  // Enable restart on exit
  agent.config.restartOnExit = 10;

  // Start the agent (blocks until all restarts exhausted or clean exit)
  await agent.start();
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
