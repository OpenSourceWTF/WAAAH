# S2: waaah-orc Rename

## Context
Rebranding "Orchestrator" to `waaah-orc`. This is the default workflow template for agents operating within the WAAAH system.

## Relationship to ARCHITECTURE.md
The `waaah-orc` workflow defines how an agent operates within the **Execution Plane**. It covers the polling loop (`wait_for_prompt`), task acknowledgment, worktree management, and review submission.

## Requirements
- Rename `.agent/workflows/waaah-orchestrator.md` → `waaah-orc.md`
- Update frontmatter: add `name: waaah-orc`
- Update config to support aliases: `['waaah-orc', 'orc', 'orchestrator', 'orch']`

## Status
DONE
