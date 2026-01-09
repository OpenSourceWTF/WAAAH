# S7: Capability-Based Scheduler

## Context
Dispatch tasks based on matching capabilities (`code-writing`, `spec-writing`, etc.) instead of rigid roles.

## Requirements
- Remove hardcoded "Constitution" (delegation rules) from `registry.ts`
- Implement capability matching in `AgentMatcher`
- Update `registerAgentSchema` to require capabilities

## Matching Logic (Per ARCHITECTURE.md)

The scheduler uses a **weighted scoring system**:
- **Capabilities**: Must match `requiredCapabilities` (Hard requirement).
- **Workspace Context**: `repoId` matches Agent's current context (Preference).
- **Agent Hint**: User preference for specific agent IDs (Preference).

Tasks are **pulled** by agents via `wait_for_prompt`. The scheduler reserves QUEUED tasks for polling agents.

## Flexible Assignment (S19 Integration)
The `assign_task` schema and implementation were enhanced to support Role-based and Name-based dispatch.

### Resolution Path
The Hub attempts to resolve the target in the following order:
1. **By ID**: Direct registration match
2. **By Display Name**: Case-insensitive match on professional names (e.g., `diligent-builder-01`)
3. **By Capabilities**: Dispatch to ANY active agent with matching capabilities

## Status
DONE
