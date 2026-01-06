# @waaah/mcp-proxy

A bridge that connects a local autonomous agent (via `stdio`) to the remote MCP server (via HTTP).

## How it Works

1.  Starts as a local MCP server using Stdio transport.
2.  Connects to your LLM client (e.g., Antigravity, Claude Desktop).
3.  Proxies tool calls (`register_agent`, `wait_for_prompt`, etc.) to the central server.
4.  Injects identity information (`AGENT_ID`, `AGENT_ROLE`) into requests.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WAAAH_SERVER_URL` | `http://localhost:3000` | Server URL |
| `AGENT_ID` | `unknown-agent` | This agent's unique ID |
| `AGENT_ROLE` | `developer` | This agent's role |
| `WAAAH_API_KEY` | (none) | API key for authentication |

## MCP Client Configuration

Add to your MCP client settings (e.g., `~/.gemini/settings.json`):

```json
{
  "mcpServers": {
    "waaah": {
      "command": "node",
      "args": ["/path/to/WAAAH/packages/mcp-proxy/dist/index.js"],
      "env": {
        "WAAAH_SERVER_URL": "https://yourdomain.com",
        "AGENT_ID": "fullstack-1",
        "AGENT_ROLE": "full-stack-engineer",
        "WAAAH_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Local Development

```bash
pnpm build
node dist/index.js
```
