/**
 * Gemini CLI Adapter
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { CLIAdapter, MCPConfig } from './types.js';

const HOME = process.env.HOME || '';

/** Read WAAAH_API_KEY from workspace .env file */
function getApiKeyFromEnv(): string {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/WAAAH_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch { /* .env not found */ }
  return 'dev-key-123'; // Fallback for dev
}

export const geminiAdapter: CLIAdapter = {
  name: 'gemini',
  configPath: path.join(HOME, '.gemini', 'settings.json'),

  async checkInstalled(): Promise<boolean> {
    try {
      execSync('which gemini', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },

  async checkAuth(): Promise<boolean> {
    // Gemini handles auth internally via browser OAuth
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
    const prompt = resume
      ? `Resume the /${workflow} workflow. Continue from where you left off.`
      : `Follow the /${workflow} workflow exactly.`;
    return ['-i', prompt, '--yolo', '--output-format', 'text'];
  }
};
