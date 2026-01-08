# @opensourcewtf/waaah-mcp-proxy

A bridge that connects a local autonomous agent (via `stdio`) to the remote WAAAH MCP server (via HTTP).

## Installation

```bash
# Global install
npm install -g @opensourcewtf/waaah-mcp-proxy

# Or use directly with npx
npx @opensourcewtf/waaah-mcp-proxy
```

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

> **Note:** `AGENT_ID` and `AGENT_ROLE` are **fallback defaults only**. When using workflow prompts (e.g., `/waaah-orc`), the workflow explicitly specifies the agent identity in `register_agent()` calls, overriding these environment variables.

## MCP Client Configuration

Add to your MCP client settings (e.g., `~/.gemini/antigravity/mcp_config.json`):

```json
{
  "mcpServers": {
    "waaah": {
      "command": "npx",
      "args": ["@opensourcewtf/waaah-mcp-proxy"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your_api_key"
      }
    }
  }
}
```

The agent identity is determined by the workflow you invoke:
- `/waaah-orc` → registers as `orchestrator-uuid` (Orchestrator)

## Local Development

```bash
pnpm build
node dist/index.js
```
