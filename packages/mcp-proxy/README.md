# @waaah/mcp-proxy

A bridge that connects a local autonomous agent (via `stdio`) to the remote MCP server (via HTTP).

## How it Works

1.  Starts as a local MCP server using Stdio transport.
2.  Connects to your LLM client (e.g., Antigravity, Claude Desktop).
3.  Proxies tool calls (`register_agent`, `wait_for_prompt`, etc.) to the central server.
4.  Provides fallback identity if not specified in tool calls.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WAAAH_SERVER_URL` | `http://localhost:3000` | Server URL (required) |
| `WAAAH_API_KEY` | (none) | API key for authentication |
| `AGENT_ID` | `unknown-agent` | Fallback agent ID (optional) |
| `AGENT_ROLE` | `developer` | Fallback agent role (optional) |

> **Note:** `AGENT_ID` and `AGENT_ROLE` are **fallback defaults only**. When using workflow prompts (e.g., `/waaah-fullstack`), the workflow explicitly specifies the agent identity in `register_agent()` calls, overriding these environment variables.

## MCP Client Configuration

Add to your MCP client settings (e.g., `~/.gemini/antigravity/mcp_config.json`):

```json
{
  "mcpServers": {
    "waaah": {
      "command": "node",
      "args": ["/path/to/WAAAH/packages/mcp-proxy/dist/index.js"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your_api_key"
      }
    }
  }
}
```

The agent identity is determined by the workflow you invoke:
- `/waaah-fullstack` → registers as `fullstack-1` (Full Stack Engineer)
- `/waaah-testeng` → registers as `test-1` (Test Engineer)
- `/waaah-pm` → registers as `pm-1` (Project Manager)

## Local Development

```bash
pnpm build
node dist/index.js
```

