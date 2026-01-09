# S2: waaah-orc Rename

## Context
Rebranding "Orchestrator" to `waaah-orc`. Internal code remains `orchestrator`.

## Requirements
- Rename `.agent/workflows/waaah-orchestrator.md` → `waaah-orc.md`
- Update frontmatter: add `name: waaah-orc`
- Update `config/agents.yaml`: `displayName: '@waaah-orc'`, aliases: `['waaah-orc', 'orc', 'orchestrator', 'orch']`

## Status
DONE
