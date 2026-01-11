# S4: Schema Updates (Spec-Driven Development)

## Context
Support **Spec-Driven Development** (per ARCHITECTURE.md Section 3.5) by embedding specification and task documents in tasks.

## Relationship to ARCHITECTURE.md
The Task entity in the **Database Schema** includes a `context` field (JSON). The `spec` and `tasks` fields extend this to allow agents to receive embedded specification documents alongside the prompt, enabling structured, verifiable work.

## Requirements

### Schema Fields (`assignTaskSchema`)
- Add optional `spec` field: Raw text of specification document (e.g., `spec.md` contents)
- Add optional `tasks` field: Raw text of task checklist (e.g., `tasks.md` contents)

### Persistence
- Persist `spec` and `tasks` in the `tasks` DB table as JSON columns
- Migration: Add columns if not present

### Retrieval
- Ensure `get_task_context` returns `spec` and `tasks` if present
- Agent can access via `ctx.spec` and `ctx.tasks`

### Agent Behavior (per S17)
- If `spec`/`tasks` provided: Agent uses as source of truth
- If absent: Agent generates inline spec before implementation

## Status
DONE
