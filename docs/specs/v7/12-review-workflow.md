# S15: Worktree Review Workflow

## Context
Formalize the lifecycle for merging agent changes from isolated worktrees back to the main branch.

## Requirements

### Tools
- Implement `request_review` (replaces `submit_review` / `submit_task`)

### Server Endpoints
- Refactor `/approve` to transition status to `APPROVED` (authorizing agent merge)
- Implement `/reject` (Set status to `IN_PROGRESS`, preserve worktree, feedback loop)

### Agent Behavior
- Update `ack_task` to support simple state handshake without filesystem side-effects
- Implement merge and cleanup logic upon receiving `APPROVED` status

## Review Flow

```
QUEUED → ASSIGNED → IN_PROGRESS → IN_REVIEW
                                      ↓
                              ┌───────┴───────┐
                              ↓               ↓
                          APPROVED        REJECTED
                              ↓               ↓
                          (Merge)     (Back to IN_PROGRESS)
                              ↓
                         COMPLETED
```

## Status
DONE
