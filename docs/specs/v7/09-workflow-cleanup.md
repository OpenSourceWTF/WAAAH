# S9: Workflow Cleanup (Deprecations)

## Context
V7 simplifies to a single agent type: `waaah-orc`. Legacy specialized workflows are removed.

## Requirements
- Delete `waaah-boss.md`, `waaah-delegate.md`, `waaah-respond.md`, `waaah-fullstack.md`, `waaah-pm.md`, `waaah-tester.md`, `waaah-check-task.md`
- Update `config/agents.yaml` to only include the `orchestrator` role
- Update `docs/ANTIGRAVITY_SETUP.md` to reflect V7 single-agent model

## Status
DONE
