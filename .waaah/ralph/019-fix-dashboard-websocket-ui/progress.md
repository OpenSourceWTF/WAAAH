# Fix Dashboard WebSocket + UI Issues

**Task:** Dashboard shows CONNECTED but no data loads. Fix WebSocket data flow and remaining UI issues.

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Iteration 0: PLAN

### Problems Identified

1. **Race condition in useTaskData** — `connectSocket()` called before handlers registered
   - Server sends `sync:full` immediately on connect
   - Handlers not ready yet → data lost
   
2. **API URL env vars wrong** — Fixed: `WAAAH_*` → `VITE_*`

3. **Potential other UI issues** — Need to verify after race condition fix

### Approach

1. Move `connectSocket()` call AFTER handlers are registered
2. Verify data loads in dashboard
3. Check for any remaining UI issues
4. Verify agent data also works

### Files to Modify
- `packages/mcp-server/client/src/hooks/useTaskData.ts`
- Potentially `useAgentData.ts` if same issue exists

---

*(Awaiting execution and verification)*
