# Ralph 020: Scheduler Dependencies + Blocked Task UI

**Task:** Fix scheduler to respect task dependencies + fix BLOCKED task UI flow

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Problems

### 1. Scheduler Schedules Dependent Tasks Prematurely
- T2 (EventBus) was assigned before T1 (Socket.io init) completed
- Orc correctly blocked with "T1 not implemented yet"
- **Root cause:** Scheduler doesn't check dependency completion before scheduling

### 2. BLOCKED Task UI Flow Broken
- Shows "Approve" button instead of "Unblock" button
- Need "Unblock" modal with **required reason field** (helps clarify for agent)
- Comments use regular messenger (already works)

---

## Iteration 0: PLAN ✓ APPROVED

### Files to Investigate

**Scheduler:**
- `packages/mcp-server/src/state/scheduler.ts`

**BLOCKED UI:**
- `packages/mcp-server/client/src/KanbanBoard.tsx` or card component
- `packages/mcp-server/client/src/components/kanban/*.tsx`

### Approach

#### Fix 1: Scheduler Dependency Check

**File:** `packages/mcp-server/src/state/scheduler.ts`

In `assignPendingTasks()`, after getting queued tasks, filter out any that have incomplete dependencies:

```typescript
// Filter out tasks with unmet dependencies
const assignableTasks = queuedTasks.filter(task => {
  if (!task.dependencies || task.dependencies.length === 0) return true;
  return task.dependencies.every(depId => {
    const dep = this.queue.getTask(depId) || this.queue.getTaskFromDB(depId);
    return dep && dep.status === 'COMPLETED';
  });
});
```

Then iterate over `assignableTasks` instead of `queuedTasks`.

---

#### Fix 2: BLOCKED Task UI - Unblock Modal

**File:** `packages/mcp-server/client/src/components/kanban/ExpandedCardView.tsx`

1. Remove `BLOCKED` from `canApprove` array (line 36)
2. Add new `canUnblock = task.status === 'BLOCKED'`
3. Show "Unblock" button when `canUnblock` is true
4. Create `UnblockModal` with required reason field
5. Call existing `/admin/tasks/:id/unblock` (or create endpoint if missing)

---

## Verification Plan

### Automated Tests

1. **Scheduler dependency test** - Add to `scheduler.test.ts`:
   ```bash
   pnpm test -- scheduler
   ```
   New test: "does not assign tasks with unmet dependencies"

2. **Full test suite** (ensure no regressions):
   ```bash
   pnpm test
   ```

### Manual Verification

1. Create two tasks where T2 depends on T1
2. Verify T2 stays QUEUED until T1 is COMPLETED
3. Open dashboard, expand a BLOCKED task
4. Verify "Unblock" button shows (not "Approve")
5. Click Unblock, verify modal requires reason
