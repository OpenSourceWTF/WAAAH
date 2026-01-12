# Ralph YOLO Progress: Fix ACK Phase Bypass Bug

**Objective**: Fix bug where tasks bypass ACK phase, leaving QUEUED tasks being worked on
**Type**: Code
**Criteria**: clarity, completeness, correctness

## Iteration 1

**Original Task:** we are bypassing the ack phase sometimes so we have a queued task that is being worked on
**Focus this iteration:** Find and fix ACK bypass paths
**Previous scores:** N/A

### Decision Log
- **Why this approach?**: Audit all code paths that allow task state changes
- **Alternates considered**: Add client-side validation (rejected - server is source of truth)

### Root Cause Analysis

**Problem**: Agents can call `send_response(status: IN_PROGRESS)` on a QUEUED task without ever calling `ack_task`. The `task-handlers.ts` `send_response` function does NOT validate the current task status before updating.

**Evidence**:
```typescript
// task-handlers.ts:62 - No status validation!
this.queue.updateStatus(params.taskId, params.status, {
  message: params.message,
  ...
});
```

**Valid State Transitions Should Be**:
- QUEUED → PENDING_ACK (when wait_for_task returns task)
- PENDING_ACK → ASSIGNED (when ack_task called)  
- ASSIGNED → IN_PROGRESS/IN_REVIEW/COMPLETED/etc (when send_response called)

**Current Bug**: QUEUED → IN_PROGRESS (send_response without ack)

### Fix
Add status validation in `send_response` to reject updates from invalid states.

### Execution Log
