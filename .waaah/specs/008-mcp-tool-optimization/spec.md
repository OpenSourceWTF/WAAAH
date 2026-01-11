# MCP Response Prompt Injection Specification
**Version:** 1.0 | **Status:** Ready

## 1. Overview
**Problem:** Agents forget to reconnect on timeout and cleanup workspaces after completion.
**Users:** All WAAAH agents.
**Solution:** Inject mandatory prompts into MCP responses with standardized format.

## 2. Standardized Response Type

```typescript
interface MCPToolResponse {
  success: boolean;
  message: string;
  prompt?: string;  // Injected instruction (markdown)
}
```

## 3. Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Define `MCPToolResponse` type in `@opensourcewtf/waaah-types` |
| FR-2 | `wait_for_prompt` timeout: IDLE status + reconnect prompt (pm/coding/testing/orc only) |
| FR-3 | `send_response` COMPLETED: cleanup prompt with merge check |

**Note:** Worktree setup is already injected into task prompts via `assign_task` — no change needed there.

## 4. Implementation

### FR-1: Response Type
```typescript
export interface MCPToolResponse {
  success: boolean;
  message: string;
  prompt?: string;
}
```

### FR-2: wait_for_prompt Timeout
```json
{
  "success": true,
  "message": "No tasks available. Waiting.",
  "prompt": "## REQUIRED ACTION\nCall wait_for_prompt again to continue listening."
}
```
*Only for roles: pm, coding, testing, orchestrator*

### FR-3: send_response COMPLETED
```json
{
  "success": true,
  "message": "Response recorded for {taskId}",
  "prompt": "## REQUIRED ACTION\n1. Verify merged: git log origin/main --oneline | head -1\n2. If not merged: git push origin feature-{taskId}\n3. Cleanup: git worktree remove .worktrees/feature-{taskId} --force"
}
```

## 5. Files to Modify

| File | Change |
|------|--------|
| `types/src/index.ts` | Add `MCPToolResponse` type |
| `wait-handlers.ts` | Standardized timeout response |
| `task-handlers.ts` | Standardized send_response |

---

## Implementation Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **Types: Add MCPToolResponse interface** | S | — | Type exists |
| T2 | **wait_for_prompt: Standardized timeout + role-filtered prompt** | M | T1 | Response matches format |
| T3 | **send_response: Add cleanup prompt on COMPLETED** | S | T1 | Response includes prompt |

## Verification Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: Verify standardized responses** | M | T2,T3 | All responses match MCPToolResponse |
