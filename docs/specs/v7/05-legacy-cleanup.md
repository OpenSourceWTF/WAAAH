# S5: Legacy Cleanup

## Context
Remove decommissioned configurations.

## Requirements
- Delete `config/system-prompts/`
- Delete `docs/design/implementation_roadmap.md`
- Update all code references to these paths

## Notes
As part of Legacy Cleanup:
- `config/agents.yaml` was REMOVED
- `system-prompts/` directory was REMOVED

These were intentionally deleted as part of the V7 Dynamic Discovery model where the bot fleet utilizes dynamic /admin/agents/status fetching to resolve role aliases, removing all filesystem dependencies for persona mapping.

## Status
DONE
