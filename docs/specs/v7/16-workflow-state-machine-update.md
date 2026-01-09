# S16: Workflow State Machine & Agent Behavior Update

## Context
The `waaah-orc.md` workflow needs to align with ARCHITECTURE.md state machine, including:
- Using raw git commands for worktree operations (not MCP tools)
- Reflecting the `IN_REVIEW → QUEUED` (on feedback) transition
- Reflecting the `IN_REVIEW → APPROVED → COMPLETED` path
- Agent affinity on feedback (same agent preference)
- Spec-driven development with fallback generation

## Relationship to ARCHITECTURE.md
Per the **Task Lifecycle** and **Git Worktree Mandate**:
- Agents use `git worktree add` and `git worktree remove` via `run_command` tool.
- Flow: Create worktree → Do Work → Commit → Push → `IN_REVIEW`.
- On approval: Merge, then **cleanup worktree on COMPLETED**.
- On feedback: Status goes back to `QUEUED`, preferring same agent.

## Requirements

### State Machine Alignment
Update STATUS ROUTING table:
- `IN_REVIEW → QUEUED` (feedback): Task returns to queue with original agent hint
- `IN_REVIEW → APPROVED`: Agent proceeds to merge
- `APPROVED → COMPLETED`: After merge AND cleanup

### Worktree Operations (Raw Git)
1. **Phase 2.2**: Use `run_command` with `git worktree add .worktrees/feature-<TASK_ID> -b feature-<TASK_ID>`
2. **Phase 3.2**: Use `run_command` with `git worktree remove .worktrees/feature-<TASK_ID> --force`

### Capabilities Update
Align `register_agent` capabilities with standard types:
- `["code-writing", "spec-writing", "test-writing", "doc-writing"]`

### Agent Affinity
When receiving a task that was previously `IN_REVIEW`:
- Check if `task.messages` contains user feedback
- Read feedback before resuming work

### Spec-Driven Development (per S17)
- Check for `ctx.spec` or `ctx.tasks` in Phase 1
- If absent, generate inline spec before implementation
- Phase 2 includes TDD (tests first) and TSDoc documentation

## Status
TODO
