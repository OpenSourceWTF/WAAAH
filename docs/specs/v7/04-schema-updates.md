# S4: Schema Updates (Spec Field)

## Context
Support "Spec-Driven Development" by embedding `Record<string, string>` file contents in tasks.

## Relationship to ARCHITECTURE.md
The Task entity in the **Database Schema** includes a `context` field (JSON). The `spec` field extends this to allow agents to receive embedded specification documents alongside the prompt, enabling richer task assignments.

## Requirements
- Add `spec` field to `assignTaskSchema`
- Persist `spec` in the `tasks` DB table as JSON
- Ensure `get_task_context` returns the embedded spec

## Status
DONE
