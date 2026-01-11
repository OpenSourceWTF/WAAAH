# Ralph Session 012: Diff Persistence Fix

**Task:** Fix diff being lost when tasks are retried

**Criteria:** clarity, completeness, correctness

## Iteration 0

### Root Cause
`doForceRetry()` in `task-lifecycle-service.ts:99` was clearing `task.response` which contains `artifacts.diff`.

### Fix
Preserve `artifacts.diff` before clearing response on force-retry (upsert behavior):
- If task has stored diff, keep it across retry
- If new response has diff, it will overwrite (normal flow)

### Scores
| Criteria | Score | Notes |
|----------|-------|-------|
| Clarity | 9 | Simple 4-line fix with clear intent |
| Completeness | 9 | Diff preserved; graceful fallback added |
| Correctness | 9 | Typecheck passes |

**Average:** 9.0/10 ✅

---

✅ COMPLETE
