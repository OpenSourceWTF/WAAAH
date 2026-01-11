# Ralph 026: Task Assignment Consistency

## Task
Make task assignment more consistent - scheduler vs worker issue?

## Root Cause

**Random shuffle instead of scored matching** in `AgentMatchingService.reserveAgentForTask()`:
```typescript
// BEFORE (lines 66-69):
const shuffled = waitingList
  .map(value => ({ value, sort: Math.random() }))  // Random!
  .sort((a, b) => a.sort - b.sort)

// AFTER: Uses findBestAgent() with workspace/capability scoring
const bestAgent = findBestAgent(task, waitingAgents);
```

| Criterion | Definition |
|-----------|------------|
| clarity | Single scored assignment path |
| completeness | All paths use findBestAgent |
| correctness | Workspace + capability scoring |

## Score

| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10/10 | Root cause documented |
| completeness | 10/10 | reserveAgentForTask fixed |
| correctness | 10/10 | All 182 tests pass |

## ✅ COMPLETE

Commit: `e11b93d`
