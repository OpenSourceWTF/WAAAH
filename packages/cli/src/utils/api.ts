/**
 * CLI API utilities - Shared HTTP client and error handling
 */
import axios from 'axios';

const SERVER_URL = process.env.WAAAH_SERVER_URL || 'http://localhost:3000';
const WAAAH_API_KEY = process.env.WAAAH_API_KEY;

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
    await axios.get(`${SERVER_URL}/debug/state`, { timeout: 3000 });
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
