# S6: CLI Parallelization (`waaah assign`)

## Context
Task breakdown and parallelization happens at the CLI level for local context analysis.

## Requirements
- Parse `tasks.md` to extract task structure and dependencies
- Heuristic: If 2+ tasks have no interdependencies → Parallel Mode
- Implementation: `waaah assign` calls `assign_task` multiple times with dependencies

## Status
DONE
