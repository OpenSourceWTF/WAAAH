
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';

// API Key management - auto-generate if not set
export function getOrCreateApiKey(): string {
  // Check env first
  if (process.env.WAAAH_API_KEY) {
    return process.env.WAAAH_API_KEY;
  }

  // Check credentials file
  const credDir = path.join(os.homedir(), '.waaah');
  const credFile = path.join(credDir, 'credentials.json');

  try {
    if (fs.existsSync(credFile)) {
      const creds = JSON.parse(fs.readFileSync(credFile, 'utf-8'));
      if (creds['api-key']) {
        console.log(`[Auth] Loaded API key from ${credFile}`);
        return creds['api-key'];
      }
    }
  } catch (e) {
    // File doesn't exist or is invalid, create new key
  }

  // Generate new API key
  const newKey = `waaah-${crypto.randomBytes(24).toString('hex')}`;

  try {
    fs.mkdirSync(credDir, { recursive: true });
    fs.writeFileSync(credFile, JSON.stringify({ 'api-key': newKey }, null, 2));
    fs.chmodSync(credFile, 0o600); // Restrict permissions
    console.log(`[Auth] Generated new API key and saved to ${credFile}`);
  } catch (e) {
    console.warn(`[Auth] Could not save API key to ${credFile}:`, e);
  }

  return newKey;
}
