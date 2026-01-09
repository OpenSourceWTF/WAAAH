# S10: `waaah task` Command (Status Summary)

## Context
Replace `waaah-check-task` with a CLI command for human-readable task status.

## Requirements
- Implement `waaah task` command that queries recent tasks (cap at 50, sorted by `updatedAt`)
- Use deterministic formatting with `chalk` to provide a high-density status report
- Support filters (`--running`, `--completed`) and detail view (`waaah task <taskId>`)
- Implement `timeAgo` helper to handle both timestamps and ISO strings safely

## Status
DONE
