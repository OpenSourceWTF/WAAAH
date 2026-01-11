# @opensourcewtf/waaah-types

Shared TypeScript definitions, Zod schemas, and interfaces for the WAAAH system.

## Installation

```bash
pnpm add @opensourcewtf/waaah-types
```

## Core Types

### Agent Types
- `AgentIdentity` — Agent registration info
- `AgentRole` — Standard roles (orchestrator, pm, developer, etc.)
- `StandardCapability` — Capability enum for scheduling

### Task Types
- `Task` — Full task object
- `TaskStatus` — QUEUED, ASSIGNED, IN_PROGRESS, etc.
- `TaskPriority` — normal, high, critical

### MCP Types
- `MCPToolResponse` — Standard tool response with optional prompt
- `AssignTaskArgs`, `RegisterAgentArgs`, etc.

## Schemas

Zod schemas for runtime validation:

```typescript
import { 
  taskSchema, 
  assignTaskSchema,
  registerAgentSchema 
} from '@opensourcewtf/waaah-types';

// Validate incoming data
const task = taskSchema.parse(rawData);
```

## Usage

```typescript
import { 
  Task, 
  AgentRole, 
  StandardCapability,
  MCPToolResponse 
} from '@opensourcewtf/waaah-types';

const response: MCPToolResponse = {
  success: true,
  message: "Task completed",
  prompt: "## NEXT STEPS\n..."
};
```
