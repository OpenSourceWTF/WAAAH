# S1: Worktree Management (Agent-Directed)

## Context
Agents are remote and manage their own Git environment locally.

## Requirements

### Tool Simplification
The Hub provides operational instructions (Notice block) during task delivery. Logic to verify or "ensure" worktree existence is integrated into the `ack_task` tool as an internal helper (`_ensureWorktree`) for local agents, while remote agents rely on the CLI/System Notice.

### Branch Naming
Standardized to `feature-{{taskId}}`.

### Cleanup (CRITICAL)
**Agents MUST remove their worktree when task reaches `COMPLETED`.**
The `clean_workspace` tool or equivalent `git worktree remove` command is the primary mechanism for worktree/branch teardown following a successful merge.

## Unified Worktree Strategy (Post Jan 8 Update)

Following the Jan 8 incident, the system transitioned to a **Unified Instruction Protocol**:

1. **System Notice**: The Hub now prepends required `git worktree` setup commands directly to the prompt. This eliminates the need for separate `create_worktree` tools.

2. **ack_task Integration**: For agents running in the same environment as the Hub, `ack_task` performs a background check (`_ensureWorktree`) to verify paths, though it remains non-blocking for remote agents.

3. **Merge & Cleanup Responsibility**: Once approved, the agent performs the merge and **must cleanup the worktree**.

## Implementation Checklist
- [x] Implement `/admin/tasks/:taskId/approve` (Refactored to remove Git operations)
- [x] Implement `/admin/tasks/:taskId/reject` with feedback and worktree preservation
- [x] Ensure `ack_task` does NOT manage worktrees
- [x] Document decentralized worktree management
- [x] Document cleanup requirement on COMPLETED
