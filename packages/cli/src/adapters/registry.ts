/**
 * CLI Adapter Registry
 * 
 * Maps CLI names to their adapter implementations.
 */
import type { CLIAdapter } from './types.js';
import { geminiAdapter } from './gemini.js';
import { claudeAdapter } from './claude.js';

const adapters: Map<string, CLIAdapter> = new Map([
  ['gemini', geminiAdapter],
  ['claude', claudeAdapter]
]);

/** Get adapter by CLI name */
export function getAdapter(name: string): CLIAdapter | undefined {
  return adapters.get(name.toLowerCase());
}

/** Get list of supported CLI names */
export function getSupportedCLIs(): string[] {
  return Array.from(adapters.keys());
}

/** Check if a CLI is supported */
export function isSupportedCLI(name: string): boolean {
  return adapters.has(name.toLowerCase());
}
