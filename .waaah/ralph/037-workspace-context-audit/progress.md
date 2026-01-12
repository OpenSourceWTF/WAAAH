# Ralph YOLO: Workspace Context Audit

**Task:** Audit MCP and admin interfaces to ensure workspaceContext is REQUIRED, eliminate unnecessary optionality, never default to server workspace  
**Type:** Code  
**Criteria:** clarity, completeness, correctness

---

## YOLO Mode — Iteration 1

### Analysis

Identified issues with workspace context optionality:

1. **`registerAgentSchema`** - `workspaceContext` was **optional**
2. **`assignTaskSchema`** - `workspaceId` was **optional** 
3. **`/admin/enqueue` route** - used server's `workspaceRoot` for security context (server default!)
4. **MCP tool definitions** - didn't require workspace fields

### Changes Made

#### packages/types/src/schemas.ts
- Made `workspaceContext` **REQUIRED** in `registerAgentSchema` (removed `.optional()`)
- Made `workspaceId` **REQUIRED** in `assignTaskSchema` (added `.min(1)`)
- Updated descriptions to clarify these are mandatory

#### packages/types/src/mcp-tools.ts
- Added `workspaceContext` to `register_agent` schema as required
- Added `workspaceId` to `assign_task` schema as required
- Updated `required` arrays to enforce these fields

#### packages/mcp-server/src/routes/admin-tasks.ts
- `/admin/enqueue` now **REQUIRES** `workspaceId` from client
- Returns 400 error if `workspaceId` not provided
- Removed `getSecurityContext(workspaceRoot)` - no longer defaults to server workspace
- Task context now uses client-provided `workspaceId`

#### Test Updates (all tests updated to include required fields)
- `packages/types/tests/schemas.test.ts`
- `packages/types/tests/mcp-tools.test.ts`  
- `packages/mcp-server/tests/tools.test.ts`
- `packages/mcp-server/tests/handlers.test.ts`
- `packages/mcp-server/tests/agent-handlers.test.ts`
- `packages/mcp-server/tests/admin-tasks.test.ts`
- `packages/mcp-server/tests/dependencies_fix.test.ts`
- `packages/mcp-server/tests/orc_reliability.test.ts`
- `packages/mcp-server/tests/server.e2e.test.ts`

### Verification

```
pnpm run build → PASS
pnpm run test → PASS
- packages/types: 48 tests passed (including new workspaceId required test)
- packages/mcp-server: 502 tests passed
- packages/cli: 6 tests passed
- packages/discord-bot: 23 tests passed
```

### Score

| Criterion | Score |
|-----------|-------|
| clarity | 10/10 |
| completeness | 10/10 |
| correctness | 10/10 |

**Justification:**
- **Clarity (10/10):** Schema docs explicitly state fields are REQUIRED. Error messages tell clients what's missing.
- **Completeness (10/10):** Fixed schemas, MCP tool definitions, admin routes, AND all tests.
- **Correctness (10/10):** Build + all 579 tests pass. No server-default fallbacks remain.

---

## ✅ YOLO COMPLETE

All criteria achieved 10/10.

<promise>CHURLISH</promise>
