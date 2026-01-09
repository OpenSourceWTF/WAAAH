# S4: Schema Updates (Spec Field)

## Context
Support "Spec-Driven Development" by embedding `Record<string, string>` file contents in tasks.

## Requirements
- Add `spec` field to `assignTaskSchema`
- Persist `spec` in the `tasks` DB table as JSON
- Ensure `get_task_context` returns the embedded spec

## Status
DONE
