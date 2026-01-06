# @waaah/mcp-server

The core orchestration engine for the WAAAH system.

## Features

- **Agent Registry**: In-memory tracking of authenticated agents and their capabilities.
- **Task Queue**: Priority-based task queue with support for:
    - Long-polling (`wait_for_prompt`)
    - Direct assignment (`assign_task`)
    - Role-based broadcasting
- **MCP Tools**: Exposes the standard WAAAH toolset via HTTP endpoints.
- **Admin API**: Endpoints for queuing tasks (used by Discord bot).

## Usage

```bash
# Start the server (default port 3000)
node dist/index.js
```

## Tools Exposed

| Tool | Action |
|------|--------|
| `register_agent` | Register identity and capabilities |
| `wait_for_prompt` | Long-poll for new tasks |
| `send_response` | Submit task results/status |
| `assign_task` | Delegate tasks to peers |
| `list_agents` | Discovery of available agents |
| `get_agent_status` | Check peer availability |
