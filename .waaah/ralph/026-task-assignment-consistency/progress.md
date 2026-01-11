# Ralph 026: Task Assignment Consistency

## Task
Make task assignment more consistent - is this a scheduler or worker issue?

## Root Cause Analysis

### 3 Parallel Assignment Paths (Not Coordinated)

| # | Location | Trigger | Matching Method |
|---|----------|---------|-----------------|
| 1 | `PollingService.waitForTask()` | Agent polls | `findPendingTaskForAgent()` - first-match |
| 2 | `AgentMatchingService.reserveAgentForTask()` | Task enqueued | **Random shuffle** |
| 3 | `Scheduler.assignPendingTasks()` | 10s loop | Calls #2 |

### The Bug: Random vs Scored Matching

**agent-matching-service.ts:78-81** uses random shuffle:
```typescript
const shuffled = waitingList
  .map(value => ({ value, sort: Math.random() }))
  .sort((a, b) => a.sort - b.sort)
  .map(({ value }) => value);
```

**agent-matcher.ts** has proper scoring (`findBestAgent`, `scoreAgent`) but it's **never called** in the main assignment paths!

### Why This Causes Inconsistency
1. Task A gets random agent X (via path 2)
2. Task B gets random agent Y (via path 2)
3. Neither respects workspace affinity or capability scoring
4. High-priority tasks may go to suboptimal agents

## Criteria

| Criterion | Definition |
|-----------|------------|
| clarity | Single assignment path documented |
| completeness | All paths use same scoring |
| correctness | Workspace + capability scoring works |

---

## Iteration 1

### Plan
1. ✅ Root cause identified - random shuffle bypasses scoring
2. Fix `AgentMatchingService.reserveAgentForTask()` to use `findBestAgent()`
3. Verify PollingService uses consistent matching
4. Remove duplicate code paths

## Changes
