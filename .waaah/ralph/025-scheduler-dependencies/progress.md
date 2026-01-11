# Ralph Session: Scheduler Dependencies Investigation

## Task
Investigate why the scheduler schedules tasks with dependencies and if spec submission creates tasks without dependencies field.

## Problem Analysis

### Root Cause
1. **Tasks created without dependencies field**: The `/enqueue` API in `admin-tasks.ts:23-61` does NOT include a `dependencies` field when creating tasks
2. **Scheduler correctly filters dependencies**: `scheduler.ts:149-163` properly filters out tasks with unmet dependencies
3. **Missing field means no filtering**: If `task.dependencies` is undefined, line 151 returns `true` (task is assignable)

### Key Code Paths

| File | Lines | Issue |
|------|-------|-------|
| `admin-tasks.ts` | 47-59 | `queue.enqueue()` call doesn't include `dependencies` |
| `scheduler.ts` | 149-151 | `!task.dependencies || task.dependencies.length === 0` returns true |
| `SpecSubmissionForm.tsx` | 16-23 | `SpecFormData` interface has no dependencies field |

### UI Issue
The user mentioned "UI seems broken because it doesn't show dependencies". This is a separate issue - the UI may not display task dependencies even if they exist.

## Criteria
| Criterion | Definition |
|-----------|------------|
| clarity | Clear documentation of why dependencies are or aren't set |
| completeness | All task creation paths handle dependencies |
| correctness | Scheduler only assigns tasks with satisfied dependencies |

---

## Iteration 1

### Plan
1. ✓ Investigate spec submission form - NO dependencies field
2. ✓ Check `/enqueue` route - NO dependencies passed
3. ✓ Verify scheduler logic - Correctly handles deps when present
4. Document: The current system works correctly IF dependencies are provided

### Finding Summary

**The scheduler is NOT broken.** The issue is:
1. Specs are submitted as single tasks WITHOUT dependencies
2. If you want task dependencies, they must be explicitly set when creating tasks
3. The UI issue (not showing dependencies) is a separate frontend bug

### Questions to Resolve
1. Does the spec submission need to generate MULTIPLE tasks with inter-dependencies?
2. Should the UI display existing dependencies on task cards?
3. Who/what creates tasks WITH dependencies? (Only `assign_task` MCP tool via `context.dependencies`?)

### Score
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10/10 | Root cause fully identified |
| completeness | 7/10 | Need to clarify if spec should create deps |
| correctness | 10/10 | Scheduler logic verified correct |

---

## Findings

### Current Behavior (Working as Designed)
- `/enqueue` API creates single tasks without dependencies
- `assign_task` MCP tool CAN specify dependencies via context
- Scheduler correctly skips tasks with unmet dependencies

### UI Missing Feature
- Task cards don't display `task.dependencies` array
- This is a frontend display issue, not scheduler bug

### Spec Submission Path
```
SpecSubmissionForm → Dashboard.onSubmit → POST /admin/tasks/enqueue
                  ↓
queue.enqueue({ ...task, NO DEPENDENCIES })
                  ↓
scheduler.assignPendingTasks() → immediately assigns (no deps to check)
```

---

## ✅ Investigation Complete

### Summary
1. **Scheduler is correct** - properly filters tasks with unmet dependencies
2. **Tasks created without deps** - `/enqueue` route doesn't accept dependencies 
3. **UI doesn't show deps** - Frontend bug, task cards don't display dependencies array

### Recommendations
1. If spec tasks need dependencies, add field to `/enqueue` API and SpecSubmissionForm
2. Add dependencies display to KanbanBoard task cards
3. Document that only `assign_task` tool currently supports dependencies
