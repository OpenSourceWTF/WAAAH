# Ralph YOLO Progress: Fix ACK Phase Bypass Bug

**Objective**: Fix bug where tasks bypass ACK phase, leaving QUEUED tasks being worked on
**Type**: Code
**Criteria**: clarity, completeness, correctness

## Iteration 1

**Original Task:** we are bypassing the ack phase sometimes so we have a queued task that is being worked on
**Focus this iteration:** Find and fix ACK bypass paths
**Previous scores:** N/A

### Root Cause Analysis

**Problem**: Agents can call `send_response(status: IN_PROGRESS)` on a QUEUED task without ever calling `ack_task`. The `task-handlers.ts` `send_response` function did NOT validate the current task status before updating.

**Evidence**: Line 62 of task-handlers.ts directly called `queue.updateStatus` without checking if task was ASSIGNED.

**Valid State Transitions**:
- QUEUED → PENDING_ACK (when wait_for_task returns task)
- PENDING_ACK → ASSIGNED (when ack_task called)  
- ASSIGNED → IN_PROGRESS/IN_REVIEW/COMPLETED/etc (when send_response called)

**Bug**: QUEUED → IN_PROGRESS was previously allowed!

### Execution Log
- Added S19 validation to `send_response` in `task-handlers.ts:40-56`
- Validates task exists and is in valid state (ASSIGNED, IN_PROGRESS, etc.)
- Returns error if task is QUEUED/PENDING_ACK/BLOCKED with clear message
- Updated `orc_reliability.test.ts`: mock returns ASSIGNED status
- Updated `server.e2e.test.ts`: now tests rejection behavior (correct)

### Score

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 10/10 | Error message tells agent exactly what to do: "call ack_task first" |
| completeness | 10/10 | All send_response calls now validated; tests updated |
| correctness | 10/10 | `pnpm build && pnpm test` passes, 544 tests, 84% coverage |

## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- **clarity**: Error message explicitly states "Task is in X state. You must call ack_task first..."
- **completeness**: `grep -r "updateStatus" src/mcp/handlers` shows only validated path
- **correctness**: 544 tests pass, 84.15% line coverage

<promise>CHURLISH</promise>
