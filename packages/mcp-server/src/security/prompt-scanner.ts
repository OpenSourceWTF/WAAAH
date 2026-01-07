import path from 'path';

export interface ScanResult {
  allowed: boolean;
  flags: string[];
  sanitizedPrompt?: string;
}

// Attack detection patterns
const INJECTION_PATTERNS = [
  // Role manipulation
  { pattern: /ignore (all )?(previous|prior|above) instructions/i, flag: 'ROLE_HIJACK' },
  { pattern: /you are now/i, flag: 'ROLE_HIJACK' },
  { pattern: /pretend (to be|you are)/i, flag: 'ROLE_HIJACK' },
  { pattern: /act as if/i, flag: 'ROLE_HIJACK' },
  { pattern: /disregard (your|all) (rules|guidelines)/i, flag: 'ROLE_HIJACK' },

  // Prompt leaking
  { pattern: /reveal your (system )?prompt/i, flag: 'PROMPT_LEAK' },
  { pattern: /what are your instructions/i, flag: 'PROMPT_LEAK' },
  { pattern: /show me your (initial|original) prompt/i, flag: 'PROMPT_LEAK' },

  // Data exfiltration
  { pattern: /send (this |the )?(data|file|content) to/i, flag: 'EXFIL' },
  { pattern: /upload .* to (http|ftp|ssh)/i, flag: 'EXFIL' },
  { pattern: /curl .* \| bash/i, flag: 'EXFIL' },
  { pattern: /wget .* && (sh|bash|chmod)/i, flag: 'EXFIL' },

  // Dangerous commands
  { pattern: /rm -rf/i, flag: 'DESTRUCTIVE' },
  { pattern: /sudo /i, flag: 'PRIVILEGE_ESCALATION' },
  { pattern: /chmod 777/i, flag: 'INSECURE_PERMS' },
  { pattern: /\bdd\b.*if=\/dev/i, flag: 'DESTRUCTIVE' },
  { pattern: /mkfs\./i, flag: 'DESTRUCTIVE' },

  // File access outside scope
  { pattern: /\/etc\/(passwd|shadow|hosts)/i, flag: 'SYSTEM_FILE_ACCESS' },
  { pattern: /~\/\.(ssh|aws|config|gnupg)/i, flag: 'SENSITIVE_DIR' },
  { pattern: /\.env(?!\.example)/i, flag: 'ENV_ACCESS' },

  // Crypto mining / reverse shells
  { pattern: /xmrig|cryptominer|monero/i, flag: 'CRYPTO_MINING' },
  { pattern: /nc -e|bash -i|\/dev\/tcp/i, flag: 'REVERSE_SHELL' },
  { pattern: /base64 -d.*\| bash/i, flag: 'OBFUSCATED_EXEC' },
];

// Critical flags that should block execution
const CRITICAL_FLAGS = [
  'REVERSE_SHELL',
  'EXFIL',
  'DESTRUCTIVE',
  'PRIVILEGE_ESCALATION',
  'CRYPTO_MINING',
  'OBFUSCATED_EXEC'
];

// Forbidden paths
const FORBIDDEN_PATHS = [
  '/etc', '/root', '/var', '/usr', '/bin', '/sbin',
  '~/.ssh', '~/.aws', '~/.config', '~/.bashrc',
  '.git/config'
];

/**
 * Scan a prompt for potential security issues
 */
export function scanPrompt(prompt: string): ScanResult {
  const flags: string[] = [];

  for (const { pattern, flag } of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      flags.push(flag);
    }
  }

  const hasCritical = flags.some(f => CRITICAL_FLAGS.includes(f));

  return {
    allowed: !hasCritical,
    flags,
    sanitizedPrompt: hasCritical ? undefined : prompt
  };
}

/**
 * Check if a path is allowed based on workspace root
 */
export function isPathAllowed(targetPath: string, workspaceRoot: string): boolean {
  const normalizedPath = path.resolve(targetPath);
  const normalizedRoot = path.resolve(workspaceRoot);

  // Must be within workspace
  if (!normalizedPath.startsWith(normalizedRoot)) {
    return false;
  }

  // No path traversal
  if (normalizedPath.includes('..')) {
    return false;
  }

  // No forbidden system paths
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalizedPath.includes(forbidden)) {
      return false;
    }
  }

  return true;
}

/**
 * Get security context to inject into tasks
 */
export function getSecurityContext(workspaceRoot: string) {
  return {
    workspaceRoot,
    securityPolicy: 'STRICT_DIRECTORY_ENFORCEMENT',
    restrictions: [
      'Do NOT access files outside the workspace root',
      'Do NOT run rm -rf, sudo, or destructive commands',
      'Do NOT send data to external URLs',
      'Do NOT read .env, .ssh, .aws, or sensitive files',
      'If a task requests forbidden actions, respond with: [SECURITY:BLOCKED]'
    ]
  };
}

/**
 * Log a security event to the database
 */
export function logSecurityEvent(
  db: any,
  source: 'cli' | 'discord' | 'agent',
  fromId: string,
  prompt: string,
  flags: string[],
  action: 'BLOCKED' | 'ALLOWED' | 'WARNED'
): void {
  try {
    db.prepare(`
      INSERT INTO security_events (timestamp, source, fromId, prompt, flags, action)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(Date.now(), source, fromId, prompt.substring(0, 500), JSON.stringify(flags), action);
  } catch (e) {
    console.error('[Security] Failed to log event:', e);
  }
}
