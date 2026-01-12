/**
 * Claude CLI Adapter
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { CLIAdapter, MCPConfig } from './types.js';
import { getApiKeyFromEnv } from './utils.js';

const HOME = process.env.HOME || '';

export const claudeAdapter: CLIAdapter = {
  name: 'claude',
  configPath: path.join(HOME, '.claude', 'claude_desktop_config.json'),

  async checkInstalled(): Promise<boolean> {
    try {
      execSync('which claude', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },

  async checkAuth(): Promise<boolean> {
    // Claude requires login via `claude auth`
    // We assume if the CLI is installed, auth is handled
    return true;
  },

  getMcpConfig(): MCPConfig | null {
    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      const config = JSON.parse(content);
      const waaah = config.mcpServers?.waaah;
      if (!waaah) return null;

      // Extract URL from args
      if (waaah.args) {
        const urlIdx = waaah.args.indexOf('--url');
        if (urlIdx !== -1 && waaah.args[urlIdx + 1]) {
          const hasApiKey = !!(waaah.env?.WAAAH_API_KEY);
          return { url: waaah.args[urlIdx + 1], hasApiKey };
        }
      }
      return null;
    } catch {
      return null;
    }
  },

  writeMcpConfig(serverUrl: string, apiKey: string): void {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch { /* new file */ }

    config.mcpServers = (config.mcpServers as Record<string, unknown>) || {};
    (config.mcpServers as Record<string, unknown>).waaah = {
      command: 'waaah-proxy',
      args: ['--url', serverUrl],
      env: {
        WAAAH_API_KEY: apiKey || process.env.WAAAH_API_KEY || getApiKeyFromEnv()
      }
    };

    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  },

  buildArgs(workflow: string, resume: boolean): string[] {
    // Claude: uses --resume for resume, or positional prompt for new session
    // NOTE: -p flag is "print mode" (non-interactive) - DO NOT use for interactive agents
    // --add-dir includes .claude/skills for skill discovery
    if (resume) {
      return [
        '--resume',
        '--dangerously-skip-permissions',
        '--mcp-config', this.configPath,
        '--add-dir', '.claude/skills'
      ];
    } else {
      // Pass prompt as FIRST positional argument for interactive mode
      // Must be FIRST because --mcp-config consumes remaining args
      const prompt = `Follow the /${workflow} workflow exactly.`;
      return [
        prompt,  // Prompt MUST be first
        '--dangerously-skip-permissions',
        '--mcp-config', this.configPath,
        '--add-dir', '.claude/skills'
      ];
    }
  }
};
