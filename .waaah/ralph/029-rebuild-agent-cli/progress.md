# Ralph 029: Rebuild Agent CLI Wrapper

**Task**: Simplify `waaah agent` to be a preflight + exec handoff (no process management)
**Type**: Code
**Criteria**: clarity, completeness, correctness

---

## Problem
Current wrapper spawns gemini/claude as subprocess → orphans when waaah killed.

## Solution: Preflight + Exec

```
waaah agent --start=gemini --as=waaah-orc-loop

1. Preflight checks:
   - [x] CLI installed?
   - [x] In git repo?
   - [x] Workflow file exists?
   
2. MCP config:
   - [x] waaah MCP configured?
   - [x] API key present?
   
3. Handoff:
   - Build command: gemini -i "Follow /workflow" --yolo
   - exec() → REPLACE current process (no subprocess)
```

## Research Findings

### Options Evaluated

| Approach | Pros | Cons |
|----------|------|------|
| `spawn` + event handlers | Async, flexible | Orphans if parent killed before cleanup |
| `spawnSync` + `stdio:'inherit'` | Blocks until done, signals propagate | Blocking (fine for CLI) |
| Native `exec` addon | True process replacement | Requires native compilation, not cross-platform |

### Winner: `spawnSync` with `stdio: 'inherit'`

**Why:**
1. **Blocking is fine** — `waaah agent` is specifically meant to run gemini/claude as the main task
2. **Signals propagate** — SIGINT/SIGTERM go to child because we share the process group
3. **TTY inherits** — Interactive prompts work correctly
4. **No orphans** — When parent waits synchronously, killing waaah kills the terminal, which kills the child

### Implementation

```typescript
import { spawnSync } from 'child_process';

// ... preflight checks ...

const result = spawnSync(cli, args, {
  cwd: workspaceRoot,
  stdio: 'inherit',
  env: process.env
});

// Parent resumes only after child exits
process.exit(result.status ?? 1);
```

## Plugin Pattern Design

### Interface

```typescript
// adapters/types.ts
export interface CLIAdapter {
  name: string;                           // 'gemini', 'claude'
  configPath: string;                     // ~/.gemini/settings.json
  
  // Preflight
  checkInstalled(): Promise<boolean>;
  checkAuth(): Promise<boolean>;
  
  // MCP config
  getMcpConfig(): MCPConfig | null;
  writeMcpConfig(serverUrl: string, apiKey: string): void;
  
  // Execution
  buildArgs(workflow: string, resume: boolean): string[];
}
```

### File Structure

```
packages/cli/src/
├── commands/
│   └── agent.ts              # Main command (uses adapters)
├── adapters/
│   ├── types.ts              # CLIAdapter interface
│   ├── registry.ts           # Map of name → adapter
│   ├── gemini.ts             # GeminiAdapter
│   └── claude.ts             # ClaudeAdapter
└── utils/
    ├── agent-utils.ts        # Keep shared utils (git root, etc.)
    └── [delete agent-runner.ts]
```

### Usage

```typescript
// commands/agent.ts
import { getAdapter } from '../adapters/registry.js';

const adapter = getAdapter(cli);  // 'gemini' → GeminiAdapter
if (!adapter) throw new Error(`Unknown CLI: ${cli}`);

// Preflight
if (!await adapter.checkInstalled()) exit(1);
if (!await adapter.checkAuth()) exit(1);

// MCP check
const mcpConfig = adapter.getMcpConfig();
if (!mcpConfig || mcpConfig.url !== serverUrl) {
  adapter.writeMcpConfig(serverUrl, apiKey);
}

// Execute
const args = adapter.buildArgs(workflow, resume);
spawnSync(adapter.name, args, { stdio: 'inherit', cwd });
```

### Example: GeminiAdapter

```typescript
// adapters/gemini.ts
export const geminiAdapter: CLIAdapter = {
  name: 'gemini',
  configPath: `${HOME}/.gemini/settings.json`,
  
  checkInstalled: () => which('gemini'),
  checkAuth: () => true,  // Gemini handles auth internally
  
  getMcpConfig: () => {
    const config = JSON.parse(fs.readFileSync(this.configPath));
    return config.mcpServers?.waaah ?? null;
  },
  
  writeMcpConfig: (url, apiKey) => {
    // ... update mcpServers.waaah in settings.json
  },
  
  buildArgs: (workflow, resume) => {
    const prompt = resume
      ? `Resume the /${workflow} workflow.`
      : `Follow the /${workflow} workflow exactly.`;
    return ['-i', prompt, '--yolo', '--output-format', 'text'];
  }
};
```

## Additional Best Practices

### Exit Codes
```typescript
enum ExitCode {
  SUCCESS = 0,
  CLI_NOT_FOUND = 1,
  AUTH_FAILED = 2,
  WORKFLOW_NOT_FOUND = 3,
  MCP_CONFIG_ERROR = 4,
  AGENT_ERROR = 5
}
```

### New Flags
| Flag | Description |
|------|-------------|
| `--dry-run` | Print command without executing |
| `--verbose` | Show detailed preflight checks |

## Files to Change

| File | Action |
|------|--------|
| `adapters/types.ts` | NEW: CLIAdapter interface + ExitCode enum |
| `adapters/registry.ts` | NEW: adapter lookup map |
| `adapters/gemini.ts` | NEW: Gemini implementation |
| `adapters/claude.ts` | NEW: Claude implementation |
| `commands/agent.ts` | MODIFY: use adapter pattern + new flags |
| `utils/agent-runner.ts` | DELETE |
| `agents/*.ts` | DELETE (3 files) |

## Verification
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm test` passes
- Manual: `waaah agent --start=gemini` works
- Manual: `waaah agent --start=claude` works
- Manual: `waaah agent --start=gemini --dry-run` prints command

### Tests to Write
| Test | Description |
|------|-------------|
| `adapters.test.ts` | Test each adapter's buildArgs, getMcpConfig |
| `agent.test.ts` | Test preflight logic, exit codes |


