# S15: Worktree Review Workflow

## Context
Formalize the lifecycle for merging agent changes from isolated worktrees back to the main branch.

## Requirements

### Tools
- Implement `request_review` (replaces `submit_review` / `submit_task`)

### Server Endpoints
- Refactor `/approve` to transition status to `APPROVED` (authorizing agent merge)
- Implement `/reject` (Set status to `QUEUED`, preserve worktree, feedback loop)

### Agent Behavior
- Update `ack_task` to support simple state handshake without filesystem side-effects
- Implement merge and worktree cleanup logic upon `COMPLETED` status

## Review Flow (Aligned with ARCHITECTURE.md)

```
QUEUED → ASSIGNED → PENDING_ACK → IN_PROGRESS → IN_REVIEW
                                                    ↓
                                          ┌────────┴────────┐
                                          ↓                 ↓
                                      APPROVED         QUEUED (Feedback)
                                          ↓                 ↓
                                     COMPLETED         (Re-assignment)
```

**Key Transitions**:
- **IN_PROGRESS → IN_REVIEW**: Agent commits & pushes to feature branch.
- **IN_REVIEW → QUEUED**: User provides feedback. Task returns to queue for re-pickup.
- **IN_REVIEW → APPROVED**: User satisfied. No changes needed.
- **APPROVED → COMPLETED**: Agent cleans up worktree. Task finalized.

## Status
DONE
