#!/usr/bin/env node
/**
 * CLI Agent Wrapper - Entry point
 * 
 * Spawns and manages external CLI coding agents (gemini, claude) with WAAAH MCP integration.
 * 
 * @packageDocumentation
 */

export { BaseAgent } from './agents/base.js';
export { GeminiAgent } from './agents/gemini.js';
export { PTYManager } from './pty/manager.js';
export { SessionManager } from './session/manager.js';
export {
  CrashRecovery,
  RecoveryStatus,
  type RecoveryResult,
  type CrashSession,
} from './session/recovery.js';
export { MCPInjector } from './config/mcp-injector.js';
export {
  scanMCPConfig,
  scanGeminiConfig,
  scanClaudeConfig,
  scanAllConfigs,
  getDefaultConfigPath,
  type MCPConfig,
  type GeminiMCPServerConfig,
  type ClaudeMCPServerConfig,
  type AgentType,
} from './config/scanner.js';
export {
  LoopDetector,
  LoopState,
  type LoopDetectionResult,
  type LoopDetectorOptions,
  type LoopEventType,
  type LoopEventHandler,
} from './monitor/loop-detector.js';
export { GitUtils } from './utils/git.js';
export { Logger } from './utils/logger.js';

// Doctor Agent module
export {
  GitPoller,
  type DoctorState,
  type ChangeCheckResult,
} from './doctor/index.js';

/**
 * Main entry point for the CLI wrapper.
 * This will be implemented to parse CLI arguments and start the agent.
 */
export async function main(): Promise<void> {
  // TODO: Implement CLI argument parsing with commander
  // TODO: Initialize agent based on --start flag
  // TODO: Configure MCP if needed
  // TODO: Start PTY session
  console.log('waaah-agent CLI wrapper - stub implementation');
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
