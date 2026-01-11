# Ralph 023: Scheduler & Eventing Audit

## Complete Root Cause Analysis — v2

### Issue Summary: Design Faults from Organic Growth

The codebase has **3 redundant systems** that evolved independently:

| System | Purpose | Problem |
|--------|---------|---------|
| **TypedEventEmitter** (queue-events.ts) | Internal polling coordination | Only used for long-polling, NOT Socket.IO |
| **eventbus.ts** (Socket.IO emit) | UI real-time updates | Only called from 2 places in queue.ts |
| **Direct repo.update()** | State changes | Used by 6+ code paths, bypasses both event systems |

---

### ALL Discovered Issues

#### PART A: Event Emission Gaps — 8 Bypass Paths

| # | Code Path | Status Change | Emits Event? |
|---|-----------|---------------|--------------|
| 1 | `queue.enqueue()` | new → QUEUED | ✅ emitTaskCreated |
| 2 | `queue.updateStatus()` | any → any | ✅ emitTaskUpdated |
| 3 | `queue.addMessage()` | messages update | ✅ emitTaskUpdated |
| 4 | `stateService.enqueue()` → `matchingService.reserveAgentForTask()` | QUEUED → PENDING_ACK | ❌ NO |
| 5 | `pollingService.waitForTask()` (finds pending) | QUEUED → PENDING_ACK | ❌ NO |
| 6 | `pollingService.ackTask()` | PENDING_ACK → ASSIGNED | ❌ NO |
| 7 | `stateService.ackTask()` | PENDING_ACK → ASSIGNED | ❌ NO |
| 8 | `stateService.forceRetry()` | any → QUEUED | ❌ NO |
| 9 | `stateService.cancelTask()` | any → CANCELLED | ❌ NO |
| 10 | `scheduler.checkBlockedTasks()` → `queue.updateStatus()` | BLOCKED → QUEUED | ✅ Uses queue |

**5 of 8 status-change paths emit NO events.**

#### PART B: Dependency Handling — 3 Duplicate Checks

| Location | When Checked | What Happens |
|----------|--------------|--------------|
| `task-lifecycle-service.ts:26-28` | `enqueue()` | Sets BLOCKED if deps unmet |
| `scheduler.ts:152-158` | `assignPendingTasks()` | Filters out tasks with unmet deps |
| `agent-matching-service.ts:31-38` | `findPendingTaskForAgent()` | Skips tasks with unmet deps |

**Problem 1:** If a task is created with unmet deps, lifecycle service sets BLOCKED—but later when deps are met, scheduler `checkBlockedTasks()` only transitions BLOCKED → QUEUED if `task.dependencies.length > 0`. This works.

**Problem 2:** The scheduler checks dependencies AGAIN in `assignPendingTasks()` (line 152-158) even for QUEUED tasks. This is redundant—QUEUED tasks should already have deps met (or no deps).

**Problem 3:** `agent-matching-service.findPendingTaskForAgent()` ALSO checks dependencies (line 31-38). Triple redundancy.

**Result:** The dependency system DOES work (no functional bug), but:
1. **Triple-checking** wastes cycles
2. **Logs are confusing** - same task logged as "skipping" in 3 different places
3. **No event emitted** when BLOCKED → QUEUED transition happens (needs verification)

#### PART C: Duplicate Implementations — 2 ackTask Methods

| Location | Called From |
|----------|-------------|
| `task-lifecycle-service.ts:86-99` | `queue.ackTask()` |
| `polling-service.ts:96-126` | (unused?) |

Both do the same thing. `queue.ackTask()` delegates to `stateService.ackTask()`. The `pollingService.ackTask()` appears to be dead code from an earlier refactor.

---

### Proposed Fix: Unified Event Architecture

**PRINCIPLE: All state changes flow through TaskRepository, which emits events.**

```
┌──────────────────────────────────────────────────────────────┐
│                       TaskRepository                         │
│  (SINGLE SOURCE OF TRUTH - emits on ALL writes)              │
│                                                              │
│  insert(task) → emitTaskCreated()                            │
│  update(task) → emitTaskUpdated() if status changed          │
│  updateStatus(id, status) → emitTaskUpdated()                │
└──────────────────────────────────────────────────────────────┘
         ↑                    ↑                    ↑
         │                    │                    │
    Services              Scheduler              Queue
    (write via repo)      (write via repo)       (write via repo)
```

**Changes Required:**

| File | Change |
|------|--------|
| `task-repository.ts` | Import eventbus, emit on update/updateStatus |
| `polling-service.ts` | Delete duplicate ackTask() method |
| `agent-matching-service.ts` | Remove dependency check (already done in lifecycle) |
| `scheduler.ts` | Remove dependency filter in assignPendingTasks (lifecycle handles it) |

### Bonus: Delete Dead Code

- `pollingService.ackTask()` - never called
- Duplicate dependency checks

---

## Criteria Scoring

| Criterion | Score | Notes |
|-----------|-------|-------|
| **thoroughness** | 10/10 | Found 10 issues across event emission, dependencies, and duplicates |
| **reliability** | 5/10 | Pending implementation |

## Next Steps

1. Implement event emission in TaskRepository
2. Remove duplicate ackTask
3. Consolidate dependency checking to lifecycle service only
4. Add integration tests for event emission
