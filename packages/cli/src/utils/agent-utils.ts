import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';

export const SUPPORTED_CLIS = ['gemini', 'claude'] as const;
export type SupportedCLI = typeof SUPPORTED_CLIS[number];
export type AgentType = 'gemini' | 'claude';

export function isSupportedCLI(cli: string): cli is SupportedCLI {
  return SUPPORTED_CLIS.includes(cli as SupportedCLI);
}

export function findWorkflowFile(workflowName: string, cwd: string): string | null {
  const workflowPath = path.join(cwd, '.agent', 'workflows', `${workflowName}.md`);
  if (fs.existsSync(workflowPath)) return workflowPath;

  // Try without .md
  const altPath = path.join(cwd, '.agent', 'workflows', workflowName);
  if (fs.existsSync(altPath)) return altPath;

  return null;
}

export function findGitRoot(cwd: string): string | null {
  let current = cwd;
  while (current !== '/') {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    current = path.dirname(current);
  }
  return null;
}

export async function checkCLIInstalled(cli: SupportedCLI): Promise<boolean> {
  try {
    execSync(`which ${cli}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function getConfigPath(agentType: AgentType): string {
  const home = process.env.HOME || '';
  return agentType === 'gemini'
    ? `${home}/.gemini/settings.json`
    : `${home}/.claude/claude_desktop_config.json`;
}

export function getMcpConfig(agentType: AgentType): { url: string; hasApiKey: boolean } | null {
  try {
    const configPath = getConfigPath(agentType);
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    const waaah = config.mcpServers?.waaah;
    if (!waaah) return null;

    // Extract URL from args
    if (waaah.args) {
      const urlIdx = waaah.args.indexOf('--url');
      if (urlIdx !== -1 && waaah.args[urlIdx + 1]) {
        // Check if API key is configured
        const hasApiKey = !!(waaah.env?.WAAAH_API_KEY);
        return { url: waaah.args[urlIdx + 1], hasApiKey };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function isProxyInstalled(): boolean {
  try {
    execSync('which waaah-proxy', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

export function promptChoice(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function configureMcp(agentType: AgentType, serverUrl: string): Promise<void> {
  // Check if proxy is installed
  const installed = isProxyInstalled();
  let proxyMethod: 'global' | 'npx' = 'global';

  if (!installed) {
    console.log('\n   ⚠️  waaah-proxy is not globally installed.');
    console.log('   1. Install globally now (npm install -g @opensourcewtf/waaah-mcp-proxy)');
    console.log('   2. Use npx each time (slower)');
    const choice = await promptChoice('   Choose (1 or 2) [default: 1]: ');

    if (choice === '2') {
      proxyMethod = 'npx';
    } else {
      console.log('   📦 Installing waaah-proxy globally...');
      try {
        execSync('npm install -g @opensourcewtf/waaah-mcp-proxy', { stdio: 'inherit' });
        console.log('   ✅ Installed!');
      } catch {
        console.log('   ❌ Install failed. Using npx.');
        proxyMethod = 'npx';
      }
    }
  } else {
    console.log('   ✅ waaah-proxy is installed globally');
  }

  // Build config
  const configPath = getConfigPath(agentType);
  let config: any = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch { /* new file */ }

  config.mcpServers = config.mcpServers || {};

  if (proxyMethod === 'global') {
    config.mcpServers.waaah = {
      command: 'waaah-proxy',
      args: ['--url', serverUrl],
      env: {
        WAAAH_API_KEY: process.env.WAAAH_API_KEY || 'dev-key-123'
      }
    };
  } else {
    config.mcpServers.waaah = {
      command: 'npx',
      args: ['-y', '@opensourcewtf/waaah-mcp-proxy', '--url', serverUrl],
      env: {
        WAAAH_API_KEY: process.env.WAAAH_API_KEY || 'dev-key-123'
      }
    };
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`   ✅ MCP configured (${serverUrl})`);
}

export async function ensureMcpConfig(agentType: AgentType, serverUrl: string): Promise<void> {
  const current = getMcpConfig(agentType);

  if (!current) {
    console.log('\n⚙️  WAAAH MCP not configured.');
    await configureMcp(agentType, serverUrl);
  } else if (current.url !== serverUrl) {
    console.log(`\n⚠️  MCP URL mismatch: ${current.url} vs ${serverUrl}`);
    const update = await promptYesNo('   Update config? (y/n): ');
    if (update) {
      await configureMcp(agentType, serverUrl);
    }
  } else if (!current.hasApiKey) {
    console.log('\n⚙️  WAAAH MCP missing API key, updating config...');
    await configureMcp(agentType, serverUrl);
  } else {
    console.log(`\n✅ MCP configured (${serverUrl})`);
  }
}
