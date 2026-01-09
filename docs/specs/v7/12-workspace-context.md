# S12: Workspace Context Inference

## Context
The scheduler matches agents by workspace. The CLI must infer project context (repository, branch, root path) and supply it during task assignment.

## Requirements
- Implement `inferWorkspaceContext()` in CLI
- Use `git remote get-url origin` for repo identity
- Use `package.json` name/path as fallback
- Supply `workspaceContext` in `assign_task`

## Status
DONE
