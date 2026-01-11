# Fix WebSocket Server Events

**Task:** Server never emits WebSocket events - app is broken

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Iteration 0: PLAN + EXECUTE

### Problem
- Orc implemented client-side WebSocket hooks
- Server-side event emission was never implemented
- No `sync:full` on connect, no `task:updated` events
- App broken: dashboard shows nothing

### Changes Made

1. **Created `eventbus.ts`**
   - `initEventBus(io)` - initialize with Socket.io server
   - `emitSyncFull(socketId, data)` - send initial state
   - `emitTaskCreated/Updated/Deleted` - task events
   - `emitAgentStatus` - agent events

2. **Updated `server.ts`**
   - Import and init EventBus
   - Add `io.on('connection')` handler
   - Send `sync:full` on connect

3. **TODO: Update `queue.ts`**
   - Call `emitTaskCreated` on enqueue
   - Call `emitTaskUpdated` on status change

### Scores (pending verification)
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | ? | TBD |
| completeness | ? | TBD |
| correctness | ? | TBD |
