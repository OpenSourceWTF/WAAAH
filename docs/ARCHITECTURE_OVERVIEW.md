# WAAAH Architecture Overview

## 1. Core Components

### 1.1 MCP Server (`packages/mcp-server`)
The heart of the system. An Express.js server that acts as a central message broker and state manager for autonomous agents.
-   **Server (`server.ts`)**: Defines HTTP endpoints and SSE streams.
-   **Agent Registry (`state/registry.ts`)**: In-memory map of active agents. Handles Registration (`register_agent`) and Eviction.
-   **Task Queue (`state/queue.ts`)**: Manages task lifecycle (`QUEUED` -> `ASSIGNED` -> `COMPLETED`/`FAILED`). Uses `better-sqlite3` for persistence.
-   **Tool Handler (`mcp/tools.ts`)**: Proxies MCP Tool calls to internal logic.

### 1.2 Bot Protocol
WAAAH uses a "Reverse-HTTP" style protocol for Agent communication:
1.  **Agents** (running locally or remotely) connect to the Server.
2.  **Registration**: Agents call `register_agent` to announce capabilities.
3.  **Polling**: Agents call `wait_for_prompt` (Long Polling) to receive tasks.
4.  **Updates**: Agents send updates via `ack_task` and `send_response`.

### 1.3 Delegation Flow
1.  User or Boss Agent submits a task (`/admin/enqueue` or `assign_task`).
2.  Task is added to `TaskQueue`.
3.  Server matches task to a `WAITING` agent (by ID or Role).
4.  Server returns task payload to the agent's pending `wait_for_prompt` call.
5.  Agent processes and returns result.

### 1.4 Admin Dashboard (`packages/mcp-server/public`)
A frontend interface to monitor and control the system.
-   **Live Feed**: Connects to `/admin/delegations/stream` (SSE).
-   **Task Management**: View, search, cancel, retry tasks.
-   **Agent Fleet**: View active agents and health status.

## 2. Key Subsystems

### 2.1 Eviction Protocol
Allows the Server/Admin to force an agent to restart or disconnect.
-   **Signal**: `controlSignal: "EVICT"` in `wait_for_prompt` response.
-   **Handling**: Agents must respect this signal and exit their process.

### 2.2 Security
-   **Prompt Scanning**: Input prompts are scanned for malicious patterns before execution.
-   **API Keys**: Optional `x-api-key` header for restricted endpoints.
