# S11: Agent Naming Convention

## Context
Agents need distinct, descriptive names (`adjective-noun-num`) for Dashboard readability and targeting via `assign_task`.

## Relationship to ARCHITECTURE.md
Agent identity is composed of:
- **ID**: Unique system identifier (UUID or custom)
- **displayName**: Human-readable name (e.g., `diligent-builder-01`)
- **Capabilities**: What the agent can do (`code-writing`, `spec-writing`)

The scheduler uses ID for exact matching, displayName for user targeting, and capabilities for task eligibility.

## Requirements
- Add `displayName` to `registerAgentSchema`
- Generate names like `methodical-builder-42` if no name provided
- Verify uniqueness in the registry
- **Workflow Usage**: Agents should capture and use `response.displayName` from registration for logging and identification

## Status
DONE
