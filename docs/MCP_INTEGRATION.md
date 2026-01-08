# MCP Integration Guide

Connect WAAAH to AI systems that support the Model Context Protocol (MCP).

## Quick Start

Install the WAAAH MCP proxy globally:
```bash
npm install -g @opensourcewtf/waaah-mcp-proxy
```

Or use directly with npx in your MCP config.

---

## Supported Platforms

| Platform | Type | MCP Support |
|----------|------|-------------|
| [Gemini CLI](#gemini-cli) | Terminal | Full |
| [Antigravity](#antigravity) | VS Code Extension | Full |
| [Claude Desktop](#claude-desktop) | Desktop App | Full |
| [Cursor](#cursor) | AI IDE | Full |
| [Windsurf](#windsurf) | AI IDE | Full |
| [OpenAI Agents SDK](#openai-agents-sdk) | Python SDK | Full |
| [Chainlit](#chainlit) | Chat UI Framework | Full |
| [Cherry Studio](#cherry-studio) | Desktop Client | Full |

---

## Gemini CLI

[Gemini CLI](https://github.com/google-gemini/gemini-cli) is Google's open-source terminal AI agent with native MCP support.

### Step 1: Install Gemini CLI

```bash
npm install -g @anthropic-ai/gemini-cli
```

### Step 2: Configure MCP Server

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "waaah": {
      "command": "npx",
      "args": ["@opensourcewtf/waaah-mcp-proxy"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Step 3: Use WAAAH Tools

```bash
gemini
> /tools  # Shows WAAAH tools: register_agent, wait_for_prompt, etc.
```

## Antigravity

Antigravity is a VS Code-based AI coding assistant with full MCP support.

### Step 1: Configure MCP Server

Add to your VS Code settings or `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "waaah": {
      "command": "npx",
      "args": ["@opensourcewtf/waaah-mcp-proxy"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Step 2: Use the Workflow

Run the `/waaah-orc` workflow to initialize as a WAAAH Orchestrator:

```
/waaah-orc
```

This registers the agent and enters the task loop.

---

## Claude Desktop

Claude Desktop by Anthropic has native MCP support.

### Step 1: Configure MCP

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "waaah": {
      "command": "npx",
      "args": ["@opensourcewtf/waaah-mcp-proxy"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Step 2: Restart Claude

Restart Claude Desktop to load the MCP server.

### Step 3: Use WAAAH Tools

In Claude, you can now use:
- `register_agent` - Register as an agent
- `wait_for_prompt` - Wait for tasks
- `send_response` - Submit results
- `assign_task` - Delegate to other agents

---

## Cursor

Cursor IDE supports MCP natively.

### Step 1: Configure MCP

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "waaah": {
      "command": "npx",
      "args": ["@opensourcewtf/waaah-mcp-proxy"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Step 2: Use in Composer

Open Cursor Composer (Cmd+I) and the WAAAH tools will be available.

---

## Windsurf

Windsurf (Codeium's AI IDE) supports MCP.

### Step 1: Configure MCP

Add to your Windsurf MCP config:

```json
{
  "mcpServers": {
    "waaah": {
      "command": "npx",
      "args": ["@opensourcewtf/waaah-mcp-proxy"],
      "env": {
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your-api-key"
      }
    }
  }
}
```

---

## OpenAI Agents SDK

The OpenAI Agents Python SDK supports MCP servers.

### Step 1: Install SDK

```bash
pip install openai-agents
```

### Step 2: Configure MCP Server

```python
from agents import Agent
from agents.mcp import MCPServerStdio

# Start WAAAH MCP proxy
waaah_server = MCPServerStdio(
    command="npx",
    args=["@opensourcewtf/waaah-mcp-proxy"],
    env={
        "WAAAH_SERVER_URL": "http://localhost:3000",
        "WAAAH_API_KEY": "your-api-key"
    }
)

agent = Agent(
    name="WAAAH Agent",
    tools=waaah_server.tools()
)
```

---

## Chainlit

Chainlit is a Python framework for building conversational AI with MCP support.

### Step 1: Install

```bash
pip install chainlit mcp
```

### Step 2: Configure

```python
import chainlit as cl
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

@cl.on_chat_start
async def start():
    server_params = StdioServerParameters(
        command="npx",
        args=["@opensourcewtf/waaah-mcp-proxy"],
        env={
            "WAAAH_SERVER_URL": "http://localhost:3000",
            "WAAAH_API_KEY": "your-api-key"
        }
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            cl.user_session.set("mcp_tools", tools)
```

---

## Cherry Studio

Cherry Studio is a desktop client supporting multiple LLM providers and MCP.

### Step 1: Configure MCP Server

In Cherry Studio settings, add an MCP server:

- **Name:** WAAAH
- **Command:** `npx @opensourcewtf/waaah-mcp-proxy`
- **Environment:**
  - `WAAAH_SERVER_URL=http://localhost:3000`
  - `WAAAH_API_KEY=your-api-key`

---

## Running the WAAAH Server

Before any integration, start the WAAAH MCP server:

```bash
# Using npm packages (recommended)
npm install -g @opensourcewtf/waaah-mcp-server
waaah-server

# Or from source
cd /path/to/WAAAH
pnpm install && pnpm build && pnpm serve
```

Or with Docker:

```bash
docker compose up waaah-server
```

The server runs on `http://localhost:3000` by default.

---

## Common Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WAAAH_SERVER_URL` | Yes | WAAAH server URL (default: `http://localhost:3000`) |
| `WAAAH_API_KEY` | Production | API key for authentication |
| `AGENT_ID` | No | Fallback agent ID (workflows override this) |
| `AGENT_ROLE` | No | Fallback role (workflows override this) |

> **Note:** `AGENT_ID` and `AGENT_ROLE` are optional fallback defaults. When using workflow prompts (e.g., `/waaah-orc`), the workflow explicitly registers the agent with the correct identity, overriding these environment variables.
