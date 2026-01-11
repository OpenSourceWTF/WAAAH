# Ralph Session 011: Fix Claude Spawn PTY

**Task:** Fix Claude agent spawning hang issue

**Criteria:** clarity, completeness, correctness

## Iteration 0

### Root Cause
Claude Code requires a proper PTY (pseudo-terminal) to function. The agent-runner was using `child_process.spawn()` with `detached: true` which doesn't provide PTY emulation.

### Changes
- Rewrote `agent-runner.ts` to use `node-pty` instead of `child_process.spawn()`
- Uses `xterm-256color` terminal emulation
- Pipes PTY output to stdout for visibility
- Simplified process lifecycle management

### Scores
| Criteria | Score | Notes |
|----------|-------|-------|
| Clarity | 9 | Clean PTY-based implementation |
| Completeness | 9 | Full rewrite with proper PTY support |
| Correctness | ? | Needs user verification |

**Average:** Pending user test

---

**Next:** User to test `pnpm waaah agent --start claude --as waaah-orc-agent`
