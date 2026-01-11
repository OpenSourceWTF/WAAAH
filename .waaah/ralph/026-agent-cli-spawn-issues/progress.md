# Ralph 026: Agent CLI Spawn Issues

**Task**: Deep dive root cause analysis on `waaah agent --start <agent>` issues
**Criteria**: clarity, completeness, correctness

---

## Iteration 1

### Root Cause Analysis

#### Issue 1: Gemini Fork Bombing

**Location**: `packages/cli-wrapper/src/agents/base.ts` lines 94-106

```typescript
private async runWithRestart(): Promise<void> {
  const maxRestarts = this.getMaxRestarts();
  let exitCode = await this.runOnce();

  while (maxRestarts === Infinity || this.restartCount < maxRestarts) {
    this.restartCount++;
    console.log(`\n🔄 Restarting agent (attempt ${this.restartCount})...`);
    await this.delay(1000);
    exitCode = await this.runOnce();
  }
  // ...
}
```

**BUG**: The while loop runs UNCONDITIONALLY after first run. It doesn't check:
1. Whether the exit was clean (exitCode === 0)
2. Whether user explicitly requested exit (Ctrl+C)

**Result**: Even if agent completes successfully and exits with code 0, the wrapper STILL restarts it. With `restartOnExit: 10`, this creates 10 spawns!

**Root Cause**: Missing `exitCode !== 0` condition in while loop.

---

#### Issue 2: Claude Hangs / Doesn't Spawn Consistently

**Location**: `packages/cli-wrapper/src/agents/claude.ts` line 49

```typescript
protected getCliArgs(): string[] {
  const prompt = `Follow the /${this.config.workflow} workflow exactly.`;
  return ['--dangerously-skip-permissions', prompt];
}
```

**Analysis**:
1. Claude CLI may require interactive confirmation even with `--dangerously-skip-permissions`
2. PTY raw mode (line 143 base.ts) might conflict with Claude's stdin handling
3. The session ID capture (lines 32-39) adds extra data handler that could interfere

**Additional Factor**: PTYManager doesn't log spawn attempts or failures clearly.

---

### Fix Plan

1. **Fix restart loop** - Only restart if exitCode !== 0 (crash/error)
2. **Add clean exit detection** - Track SIGINT/SIGTERM for intentional exits
3. **Add spawn timeout** - Detect hangs early
4. **Improve logging** - Add debug output for spawn lifecycle

---

## Implementation

### Fix 1: base.ts restart loop
