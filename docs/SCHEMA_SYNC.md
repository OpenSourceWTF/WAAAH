# Schema Synchronization Report

## Database: `packages/mcp-server/data/waaah.db`

## Current SQLite Schema vs TypeScript Types

### `tasks` Table

| Column | SQLite | TypeScript `Task` | db.ts CREATE | Notes |
|--------|--------|-------------------|--------------|-------|
| id | TEXT PRIMARY KEY | string | ✅ | |
| status | TEXT NOT NULL | TaskStatus | ✅ | |
| prompt | TEXT NOT NULL | string | ✅ | |
| priority | TEXT | 'high'│'normal'│'critical' | ✅ | |
| fromAgentId | TEXT | from.id | ✅ | |
| fromAgentName | TEXT | from.name | ✅ | |
| toAgentId | TEXT | to.agentId | ✅ | |
| toAgentRole | TEXT | to.role | ✅ | |
| context | TEXT | Record<string, unknown> | ✅ | JSON |
| response | TEXT | any | ✅ | JSON |
| createdAt | INTEGER NOT NULL | number | ✅ | |
| completedAt | INTEGER | number | ✅ | |
| assignedTo | TEXT | string | ✅ | Migration exists |
| **dependencies** | TEXT | string[] | ❌ MISSING | JSON array |
| **history** | TEXT | TaskHistoryEvent[] | ❌ MISSING | JSON array |
| title | - | string? | ❌ | Optional |

### `agents` Table

| Column | SQLite | TypeScript | db.ts CREATE | Notes |
|--------|--------|------------|--------------|-------|
| id | TEXT PRIMARY KEY | string | ✅ | |
| role | TEXT NOT NULL | AgentRole | ✅ | |
| displayName | TEXT NOT NULL | string | ✅ | |
| color | TEXT | string | ✅ | |
| capabilities | TEXT | string[] | ✅ | JSON |
| lastSeen | INTEGER | number | ✅ | |
| eviction_requested | BOOLEAN | - | ✅ | Migration exists |
| eviction_reason | TEXT | string | ✅ | Migration exists |
| canDelegateTo | TEXT | string[] | ✅ | JSON |
| createdAt | INTEGER | number | ✅ | Migration exists |
| **workspaceContext** | - | WorkspaceContext | ❌ MISSING | From registerAgentSchema |

### `task_messages` Table

| Column | SQLite | TypeScript `TaskMessage` | db.ts CREATE | Notes |
|--------|--------|--------------------------|--------------|-------|
| id | TEXT PRIMARY KEY | string | ❌ MISSING | Whole table missing |
| taskId | TEXT NOT NULL | string | ❌ MISSING | |
| role | TEXT NOT NULL | 'user'│'agent'│'system' | ❌ MISSING | |
| content | TEXT NOT NULL | string | ❌ MISSING | |
| timestamp | INTEGER NOT NULL | number | ❌ MISSING | |
| metadata | TEXT | Record<string, unknown> | ❌ MISSING | JSON |

## Action Required

1. Add `dependencies TEXT` and `history TEXT` to tasks CREATE TABLE
2. Add `task_messages` table to db.ts
3. Add migrations for dependencies and history columns
4. Consider adding `title TEXT` to tasks table
5. Consider adding `workspaceContext TEXT` to agents table
