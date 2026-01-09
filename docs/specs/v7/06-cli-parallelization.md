# S6: CLI Parallelization (`waaah assign`)

## Context
Task breakdown and parallelization happens at the CLI level for local context analysis.

## Relationship to ARCHITECTURE.md
The CLI operates in the **Control Plane**. When `waaah assign` parses a `tasks.md`, it creates multiple tasks in the MCP Server queue. The **Pull architecture** means agents will poll (`wait_for_prompt`) and the scheduler will match them based on capabilities and workspace context.

## Requirements
- Parse `tasks.md` to extract task structure and dependencies
- Heuristic: If 2+ tasks have no interdependencies → Parallel Mode
- Implementation: `waaah assign` calls `assign_task` multiple times
- Dependencies are tracked via the `dependencies` field in the Task schema
- Tasks remain `BLOCKED` until dependencies are `COMPLETED` (per scheduler logic)

## Status
DONE
