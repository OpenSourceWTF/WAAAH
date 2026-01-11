# Fix Dashboard WebSocket + UI Issues

**Task:** Dashboard shows CONNECTED but no data loads. Fix WebSocket data flow and remaining UI issues.

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Iteration 1: EXECUTE

### Problems Found & Fixed

1. **Race condition in hooks** 
   - `connectSocket()` called BEFORE handlers registered
   - Server sends `sync:full` immediately on connect → missed
   - **Fix:** Move `connectSocket()` AFTER `.on()` handlers in both `useTaskData.ts` and `useAgentData.ts`

2. **BLOCKED tasks filtered out**
   - `activeTasks` useMemo filtered out BLOCKED status
   - All 8 tasks were BLOCKED → nothing showed
   - **Fix:** Remove BLOCKED from filter (it's not terminal like COMPLETED/CANCELLED)

3. **sync:full only sent active tasks**
   - `queue.getAll()` returns only active tasks
   - Completed/cancelled swimlanes were empty
   - **Fix:** Include `getTaskHistory({ status: 'COMPLETED' })` and `getTaskHistory({ status: 'CANCELLED' })` in sync:full

4. **API env vars wrong prefix**
   - `api.ts` used `WAAAH_API_KEY` instead of `VITE_WAAAH_API_KEY`
   - Vite only exposes `VITE_*` vars to client
   - **Fix:** Change to `VITE_WAAAH_API_KEY` and `VITE_API_URL`

### Files Modified
- `packages/mcp-server/client/src/hooks/useTaskData.ts`
- `packages/mcp-server/client/src/hooks/useAgentData.ts`
- `packages/mcp-server/client/src/lib/api.ts`
- `packages/mcp-server/src/server.ts`

### Scores
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10 | Clean fixes, clear comments |
| completeness | 10 | All swimlanes load correctly |
| correctness | 10 | Verified working by user |

---

## ✅ COMPLETE

**Average: 10/10**
