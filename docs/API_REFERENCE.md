# WAAAH MCP API Reference

## 1. HTTP Endpoints

### 1.1 Management
-   `GET /health`: Health check. Returns `{ status: 'ok' }`.
-   `GET /debug/state`: Returns full memory state (Agents, Tasks).
-   `GET /admin/stats`: Returns queue statistics.

### 1.2 Tasks (Admin)
-   `POST /admin/enqueue`: Enqueue a new task.
    -   Body: `{ prompt, agentId, role, priority }`.
-   `GET /admin/tasks`: Get all active (in-memory) tasks.
-   `GET /admin/tasks/history`: Get historical tasks (DB).
    -   Params: `status`, `agentId`, `limit`, `offset`, `q` (Search).
-   `GET /admin/tasks/:taskId`: Get specific task details.
-   `POST /admin/tasks/:taskId/cancel`: Cancel a task.
-   `POST /admin/tasks/:taskId/retry`: Force retry a task.

### 1.3 Agents (Admin)
-   `GET /admin/agents/status`: Get list of connected agents.
-   `POST /admin/evict`: Queue an eviction for an agent.
    -   Body: `{ agentId, reason, action }`.
-   `POST /admin/agents/:agentId/evict`: Request immediate eviction.

### 1.4 Streams (SSE)
-   `GET /admin/delegations/stream`: Real-time event stream.
    -   Events: `delegation`, `completion`, `activity`.

### 1.5 Bot Status
-   `GET /admin/bot/status`: Returns `{ connected: boolean, count: number }`.

### 1.6 Logs
-   `GET /admin/logs`: Get recent system logs (last 100).

## 2. MCP Tools (RPC)
Accessible via `POST /mcp/tools/:toolName`.

-   `register_agent`: Register capabilities.
-   `wait_for_prompt`: Long-poll for tasks.
-   `ack_task`: Acknowledge task receipt.
-   `send_response`: Submit task result.
-   `assign_task`: Delegate task to another agent.
-   `list_agents`: List available agents.
-   `get_agent_status`: Get status of a specific agent.
-   `admin_update_agent`: Update agent metadata.
-   `list_connected_agents`: List currently connected (TCP-wise) agents.
-   `wait_for_task`: Wait for specific task completion.
-   `admin_evict_agent`: Evict agent (tool wrapper).
