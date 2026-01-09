# S12: Workspace Context Inference

## Context
The scheduler matches agents by workspace. Agents must report their `workspaceContext` (Repo ID, Branch, Local/Github) and the CLI must infer project context during task assignment.

## Requirements
- Implement `inferWorkspaceContext()` in CLI
- Use `git remote get-url origin` for repo identity
- Use `package.json` name/path as fallback
- Supply `workspaceContext` in `assign_task`

## Key Assumptions (Per ARCHITECTURE.md)
- File system is **NOT** generic. Unique environments per agent.
- `assign_task` specifies the target environment.
- Agents MUST use `git worktree` for isolation.

## Status
DONE
