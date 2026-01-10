# Ralph Progress: CLI Wrapper Fixes

## Task
Fix the CLI wrapper to get both Gemini and Claude working correctly:
1. Parsing logic shared between both is broken
2. Ctrl+C doesn't work for Gemini

## Type: `code`

## Criteria
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | - | - |
| completeness | - | - |
| correctness | - | - |

---

## Iteration 0: Analysis

### Issues Identified

**Issue 1: Ctrl+C Not Working**
- **Root Cause**: In `base.ts:145`, `setRawMode(true)` is called which intercepts Ctrl+C and prevents SIGINT from being delivered
- **Secondary Issue**: There are TWO SIGINT handlers competing:
  1. `manager.ts:157` - Has its own SIGINT handler that calls `this.kill()` and `process.exit(0)`
  2. `graceful-shutdown.ts:100` - Is installed via `shutdown.install()` in `index.ts:213`
- When raw mode is enabled, Ctrl+C becomes ASCII 0x03 data rather than a signal. The code needs to detect this.

**Issue 2: Parsing Issues (Common between Gemini/Claude)**
- Need to investigate further - checking output handling

### Files Affected
- `packages/cli-wrapper/src/agents/base.ts` - stdin forwarding & raw mode
- `packages/cli-wrapper/src/pty/manager.ts` - SIGINT handler conflict
- `packages/cli-wrapper/src/index.ts` - graceful shutdown setup

### Proposed Fixes
1. Remove duplicate SIGINT handler from `manager.ts` (let graceful-shutdown handle it)
2. In `base.ts`, detect Ctrl+C (0x03) in raw mode and trigger graceful shutdown
3. Investigate parsing issues in output handling

---
