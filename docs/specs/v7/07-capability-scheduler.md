# S7: Capability-Based Scheduler

## Context
Dispatch tasks based on matching capabilities (`planning`, `coding`, etc.) instead of rigid roles.

## Requirements
- Remove hardcoded "Constitution" (delegation rules) from `registry.ts`
- Implement `getAgentsByCapability(cap)` matching
- Update `registerAgentSchema` to require capabilities

## Flexible Assignment (S19 Integration)
The `assign_task` schema and implementation were enhanced to support Role-based and Name-based dispatch.

### Schema
`targetAgentId` is now optional; added `targetRole`.

### Resolution Path
The Hub attempts to resolve the target in the following order:
1. **By ID**: Direct registration match
2. **By Display Name**: Case-insensitive match on professional names (e.g., `diligent-builder-01`)
3. **By Role**: Dispatch to ANY active agent with the specified role

## Status
DONE
