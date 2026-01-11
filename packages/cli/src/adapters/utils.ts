/**
 * Shared utilities for CLI adapters
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Read WAAAH_API_KEY from workspace .env file
 * Falls back to 'dev-key-123' if not found
 */
export function getApiKeyFromEnv(): string {
  try {
    const envPath = path.join(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
    const match = content.match(/WAAAH_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch { /* .env not found */ }
  return 'dev-key-123'; // Fallback for dev
}
