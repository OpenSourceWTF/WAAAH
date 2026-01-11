# S8: CLI Init with Workflow Templates

## Context
`waaah init` must bundle and copy workflows into the local project, preparing the environment for agents.

## Relationship to ARCHITECTURE.md
Per the **Git-Based Isolation** principle, agents operate in isolated worktrees. The `waaah init` command sets up the project structure that agents will use when creating worktrees for tasks.

## Requirements
- Scaffold `waaah.json` for project configuration
- Support `--template minimal|standard`
- **Minimal**: Creates `waaah.json` and `.agent/workflows/`
- **Standard**: Adds `.agent/task.md` and `.agent/workflows/example-workflow.md`
- The `.worktrees/` directory (for agent isolation) is created on-demand by agents

## Status
DONE
