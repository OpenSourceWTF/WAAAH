# Spec 003 Gap Analysis: Data Layer WebSocket Overhaul

## 🚨 CRITICAL: Application Broken State

The dashboard is non-functional because **the server never emits WebSocket events**, but the client was refactored to depend on them.

---

## Gap Analysis by Migration Phase

### Phase 1: Add Socket.io to server ✅
| Component | Status | Location |
|-----------|--------|----------|
| socket.io installed | ✅ | package.json |
| SocketIOServer created | ✅ | server.ts:30 |
| io exported | ✅ | server.ts:134 |

### Phase 1.5: Client config ❌ FIXED
| Component | Status | Issue |
|-----------|--------|-------|
| VITE_API_URL in .env.local | ❌→✅ | Was missing, client connected to 5173 instead of 3000 |
| VITE_WAAAH_API_KEY | ✅ | Was there but wrong prefix |

### Phase 2: Add auth middleware ✅
| Component | Status | Location |
|-----------|--------|----------|
| socket-auth.ts exists | ✅ | mcp/socket-auth.ts |
| applySocketAuth called | ✅ | server.ts:38 |

### Phase 3: Emit events on writes ❌ MISSING
| Component | Status | Issue |
|-----------|--------|-------|
| EventBus module | ❌ | Never created |
| `io.emit('sync:full')` | ❌ | Not implemented |
| `io.emit('task:*:created')` | ❌ | Not implemented |
| `io.emit('task:*:updated')` | ❌ | Not implemented |
| `io.emit('agent:*:status')` | ❌ | Not implemented |

**Result:** Client subscribes to events that are never emitted.

### Phase 4: Update client hooks ⚠️ PARTIAL
| Component | Status | Issue |
|-----------|--------|-------|
| socket.ts singleton | ✅ | Works |
| useWebSocket.ts | ✅ | Works |
| useTaskData.ts WebSocket | ⚠️ | Subscribes but no events come |
| useAgentData.ts | ❓ | Need to check |

### Phase 5: Remove polling ⚠️ PREMATURE
| Component | Status | Issue |
|-----------|--------|-------|
| setInterval removed | ✅ | Removed |
| REST kept for pagination | ✅ | Works |

**Result:** Polling removed before server-side events were implemented.

---

## Root Cause Analysis

### What Went Wrong

1. **Half-baked implementation:** Client refactored to use WebSocket, but server-side event emission never implemented.

2. **No EventBus:** Spec called for `src/state/eventbus.ts` to emit events on DB writes. Never created.

3. **No `sync:full` on connect:** Client expects initial state via WebSocket, but server never sends it.

4. **Verification gaps:** Tasks were marked complete without E2E testing that data actually flows.

### Why It Happened (Brutal Honesty)

1. **Orc skipped IN_REVIEW:** Tasks went straight to COMPLETED without review. Fixed today but damage was done.

2. **Tasks were parallelized incorrectly:** T4 (emit events on task writes) and T5 (emit events on agent writes) depend on T2 (EventBus), but agents likely worked in parallel without checking dependencies.

3. **Individual task verification passed, but integration failed:** Each agent verified their piece (client hook tests mocked the socket), but no one verified the full flow.

4. **No smoke test:** The verify commands checked if files exist or tests pass, but didn't check if the app actually works end-to-end.

---

## Missing Components

### 1. EventBus Module (T2 - never done)
```typescript
// src/state/eventbus.ts - DOES NOT EXIST
import { io } from '../server';

export function emitTaskEvent(taskId: string, action: string, payload: any) {
  io.emit(`task:${taskId}:${action}`, payload);
}
```

### 2. Integration with queue.ts (T4 - never done)
When tasks are created/updated, need to call `emitTaskEvent()`.

### 3. Integration with agent-repository.ts (T5 - never done)
When agents register/update, need to call `emitAgentEvent()`.

### 4. `sync:full` on connect (never done)
```typescript
io.on('connection', (socket) => {
  socket.emit('sync:full', {
    tasks: queue.getAll(),
    agents: registry.getAll()
  });
});
```

---

## How to Fix

### Immediate Fix (restore app functionality)
1. Add `sync:full` emission on socket connect
2. Add event emission in queue.ts for task changes
3. Add event emission in agent-repository.ts for agent changes

### Long-term Prevention

1. **Add E2E smoke test to spec:** Verify actual data flow, not just file existence.

2. **Update orc workflow:** We already added anti-patterns today. Monitor compliance.

3. **Add integration gate:** Before merging, run a quick browser test that shows tasks in dashboard.

4. **Dependency enforcement:** Don't start T4 until T2 is actually merged and working.

---

## Status Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| 1 | T1 | ✅ Complete |
| 2 | T3 | ✅ Complete |
| 3 | T2, T4, T5 | ❌ **NOT DONE** |
| 4 | T6, T7, T8, T9 | ⚠️ Done but broken |
| 5 | T10 | ⚠️ Done prematurely |
| Verify | V1-V6 | ❓ Need to check |

**App is broken because Phase 3 was skipped.**
