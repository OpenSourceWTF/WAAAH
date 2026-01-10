/**
 * CLI API utilities - Shared HTTP client and error handling
 */
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SERVER_URL = process.env.WAAAH_SERVER_URL || 'http://localhost:3000';

/**
 * Get API key from environment or credentials file
 * Priority: WAAAH_API_KEY env -> ~/.waaah/credentials.json
 */
function getApiKey(): string | undefined {
  // Check env first
  if (process.env.WAAAH_API_KEY) {
    return process.env.WAAAH_API_KEY;
  }

  // Check credentials file
  const credFile = path.join(os.homedir(), '.waaah', 'credentials.json');
  try {
    if (fs.existsSync(credFile)) {
      const creds = JSON.parse(fs.readFileSync(credFile, 'utf-8'));
      if (creds['api-key']) {
        return creds['api-key'];
      }
    }
  } catch {
    // Ignore errors, return undefined
  }

  return undefined;
}

const WAAAH_API_KEY = getApiKey();

// Configure axios defaults
if (WAAAH_API_KEY) {
  axios.defaults.headers.common['X-API-Key'] = WAAAH_API_KEY;
}

export { SERVER_URL };

/**
 * Make an API call with standardized error handling
 */
export async function apiCall<T>(
  method: 'get' | 'post',
  path: string,
  data?: Record<string, unknown>
): Promise<T> {
  const url = `${SERVER_URL}${path}`;
  const response = method === 'get'
    ? await axios.get(url, { timeout: 60000 })
    : await axios.post(url, data, { timeout: 60000 });
  return response.data;
}

/**
 * Parse MCP tool response content
 */
export function parseMCPResponse<T>(response: { content?: { text?: string }[] }): T | null {
  const text = response.content?.[0]?.text;
  if (!text) return null;
  return JSON.parse(text) as T;
}

/**
 * Handle CLI errors consistently
 * @param error - The caught error
 * @param exitOnFail - Whether to exit the process (true for commands, false for interactive)
 */
export function handleError(error: unknown, exitOnFail = true): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ ${exitOnFail ? 'Failed: ' : ''}${message}`);
  if (exitOnFail) process.exit(1);
}

/**
 * Check server connectivity
 */
export async function checkServerConnection(): Promise<boolean> {
  try {
    await axios.get(`${SERVER_URL}/health`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure server is running, exit if not
 */
export async function ensureServerRunning(): Promise<void> {
  const isRunning = await checkServerConnection();
  if (!isRunning) {
    console.error('❌ Cannot connect to WAAAH server at', SERVER_URL);
    console.error('   Hint: Start the server with `pnpm server` in another terminal.');
    process.exit(1);
  }
}
