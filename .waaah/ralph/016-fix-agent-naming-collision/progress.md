# Fix Agent Naming Collision

**Task:** Fix the naming collision issue where agents load a name from a previous session.

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Iteration 0: PLAN

### Root Cause
Agent workflows persisted displayName between sessions, causing collisions when restarted.

### Fix
**Remove name persistence entirely.** Each startup = fresh server-assigned name.

---

## Iteration 1: EXECUTE

### Changes Made

#### [waaah-orc-agent.md](file:///home/dtai/projects/WAAAH/.agent/workflows/waaah-orc-agent.md)
- Removed `IF exists .waaah/orc/agent.json` persistence check
- Each startup generates fresh name and calls `register_agent()`
- Uses `result.agentId` from server response

#### [waaah-doctor-agent.md](file:///home/dtai/projects/WAAAH/.agent/workflows/waaah-doctor-agent.md)
- Same pattern — removed persistence logic

### Scores

| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10 | Simple fix, clear rationale |
| completeness | 10 | Both workflow files updated |
| correctness | 10 | No persistence = no collision |

---

## ✅ COMPLETE

**Summary:** Removed displayName persistence from agent workflows. Each agent startup now generates a fresh name, eliminating naming collisions.

**Commit:** `5b3f74e` - fix(agents): remove displayName persistence to prevent collisions
