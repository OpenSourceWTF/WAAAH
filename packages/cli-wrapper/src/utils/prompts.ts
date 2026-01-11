import * as readline from 'readline';
import { execSync } from 'child_process';

/**
 * Prompt user for yes/no input
 */
export async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Check if waaah-proxy is globally installed
 */
export function isProxyGloballyInstalled(): boolean {
  try {
    execSync('which waaah-proxy', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Prompt user to choose proxy installation method
 */
export async function promptProxyMethod(): Promise<'global' | 'npx'> {
  const isInstalled = isProxyGloballyInstalled();

  if (isInstalled) {
    console.log('   ✅ waaah-proxy is globally installed');
    return 'global';
  }

  // Not installed - ask user what to do
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n   ⚠️  waaah-proxy is not globally installed.');
    console.log('   How should the WAAAH proxy be invoked?');
    console.log('   1. Install globally now (npm install -g @opensourcewtf/waaah-mcp-proxy)');
    console.log('   2. Use npx each time (slower, downloads on each run)');

    rl.question('   Choose (1 or 2) [default: 1]: ', async (answer) => {
      rl.close();

      if (answer.trim() === '2') {
        resolve('npx');
      } else {
        // Install globally
        console.log('\n   📦 Installing waaah-proxy globally...');
        try {
          execSync('npm install -g @opensourcewtf/waaah-mcp-proxy', { stdio: 'inherit' });
          console.log('   ✅ Installed successfully!');
          resolve('global');
        } catch (error) {
          console.log('   ❌ Installation failed. Falling back to npx.');
          resolve('npx');
        }
      }
    });
  });
}
