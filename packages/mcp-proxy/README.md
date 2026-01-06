# @waaah/mcp-proxy

A bridge application that connects a local autonomous agent (via `stdio`) to the remote `mcp-server` (via HTTP).

## How it Works

1.  **Starts** as a local MCP server using Stdio transport.
2.  **Connects** to your LLM client (e.g., Antigravity, Claude Desktop).
3.  **Proxies** specific tool calls (`register_agent`, `wait_for_prompt`, etc.) to the central `mcp-server` over HTTP.
4.  **Injects** identity information (`AGENT_ID`, `AGENT_ROLE`) into requests if not provided by the LLM.

## Configuration

Set environment variables before running:

```bash
export WAAAH_SERVER_URL="http://localhost:3000"
export AGENT_ID="my-agent-1"
export AGENT_ROLE="full-stack-engineer"
```

## Usage

Can be used in any MCP-compatible client configuration:

```json
{
  "mcpServers": {
    "waaah": {
      "command": "node",
      "args": ["/path/to/waaah/packages/mcp-proxy/dist/index.js"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "AGENT_ID": "dev-1",
        "AGENT_ROLE": "developer"
      }
    }
  }
}
```
