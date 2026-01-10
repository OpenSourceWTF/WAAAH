/**
 * @fileoverview Agent module exports.
 * Provides the base class, types, and agent implementations.
 */

export {
  BaseAgent,
  type AgentConfig,
  type OutputCallback,
  type ErrorCallback,
  type ExitCallback,
} from './base.js';

export {
  GeminiAgent,
  GeminiNotInstalledError,
  GeminiLoginRequiredError,
} from './gemini.js';
