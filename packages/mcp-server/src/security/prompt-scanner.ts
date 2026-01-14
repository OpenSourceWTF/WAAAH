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
 * Scans a prompt string for potential security threats or role - breaking injection attempts.
 * Uses a list of regex patterns to detect issues.
 * 
 * @param prompt - The input prompt to scan.
 * @returns A ScanResult object containing allowed status and any detected flags.
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
 * Checks if a target path is safely within the workspace root.
 * Prevents path traversal and access to forbidden system directories.
 * 
 * @param targetPath - The absolute or relative path to check.
 * @param workspaceRoot - The root directory to enforce confinement within.
 * @returns True if the path is allowed, false otherwise.
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
 * Generates a standard security context object for task execution.
 * Includes policy definitions and restrictions list.
 * 
 * @param workspaceRoot - The root directory of the workspace.
 * @returns Security context object.
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
 * Logs a security event to the database for audit purposes.
 * 
 * @param db - The database instance.
 * @param source - The source of the prompt(cli, discord, agent).
 * @param fromId - The ID of the entity sending the prompt.
 * @param prompt - The prompt content(will be truncated).
 * @param flags - Array of detected security flags.
 * @param action - The action taken(BLOCKED, ALLOWED, WARNED).
 */
export function logSecurityEvent(
  db: import('better-sqlite3').Database,
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
