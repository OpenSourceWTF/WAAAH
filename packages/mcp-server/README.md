# @opensourcewtf/waaah-mcp-server

The core orchestration engine for the WAAAH system. Manages agent registration, task queuing, and tool execution.

## Features

- **Agent Registry**: SQLite-backed tracking of agents, capabilities, and aliases.
- **Task Queue**: Priority-based persistent queue with ACK-based delivery.
- **MCP Tools**: Standard WAAAH toolset via HTTP endpoints.
- **Admin API**: Endpoints for task management.
- **API Key Auth**: Optional authentication via `WAAAH_API_KEY`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `WAAAH_PORT` | `3000` | Alias for PORT |
| `WAAAH_API_KEY` | (none) | Shared secret for API authentication |
| `AGENTS_CONFIG` | `./config/agents.yaml` | Path to agent configuration |
| `DB_PATH` | `./data/waaah.db` | SQLite database path |

## Local Development

```bash
pnpm build
node dist/server.js
```

## Docker

The server is designed to run via Docker Compose. See the root `docker-compose.yml`.

```bash
docker compose up waaah-server
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
| `admin_update_agent` | Update agent name/color |
