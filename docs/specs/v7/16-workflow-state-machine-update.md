# S16: Workflow State Machine & Worktree Tools Update

## Context
The `waaah-orc.md` workflow needs to align with ARCHITECTURE.md state machine, specifically:
- Using correct MCP tools (`create_worktree`, `clean_workspace`) instead of raw git commands
- Reflecting the `IN_REVIEW → QUEUED` (on feedback) transition
- Reflecting the `IN_REVIEW → APPROVED → COMPLETED` path

## Relationship to ARCHITECTURE.md
Per the **Task Lifecycle** and **Git Worktree Mandate**:
- Agents MUST use `git worktree` for isolation.
- Flow: `create_worktree` → Do Work → Commit → Push → `IN_REVIEW`.
- On approval: Merge, then **cleanup worktree on COMPLETED**.
- On feedback: Status goes back to `QUEUED`, agent picks it up again.

## Requirements

### State Machine Alignment
Update STATUS ROUTING table:
- `IN_REVIEW → QUEUED` (feedback): Agent picks up task again with comments
- `IN_REVIEW → APPROVED`: Agent proceeds to merge
- `APPROVED → COMPLETED`: After merge AND cleanup

### Tool Updates
1. **Phase 2.2**: Use `create_worktree({ taskId, repoPath })` MCP tool instead of raw git commands
2. **Phase 3.2**: Use `clean_workspace({ taskId })` MCP tool for cleanup
3. Update TOOL REFERENCE table with new tools

### Capabilities Update
Align `register_agent` capabilities with standard types:
- `["code-writing", "spec-writing", "test-writing"]`

## Status
TODO
