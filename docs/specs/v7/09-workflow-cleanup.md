# S9: Workflow Cleanup (Deprecations)

## Context
V7 simplifies agent workflows. The `waaah-orc` workflow is the default orchestrator pattern. Specialized role-based workflows were removed in favor of **capability-based matching** (per ARCHITECTURE.md).

## Clarification (Multi-Agent Model)
The system supports **multiple agents** with different capabilities. What was deprecated are the role-specific workflow *files*, not the concept of specialized agents. Agents register with capabilities (`code-writing`, `spec-writing`, etc.) and the scheduler matches tasks to agents dynamically.

## Requirements
- Delete legacy workflow files: `waaah-boss.md`, `waaah-delegate.md`, `waaah-respond.md`, `waaah-fullstack.md`, `waaah-pm.md`, `waaah-tester.md`, `waaah-check-task.md`
- Update docs to reflect capability-based dispatch (no static role mapping)

## Status
DONE
