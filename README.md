# WAAAH: Web Accessible Autonomous Agent Hub

WAAAH is a system for orchestrating autonomous AI agents (who may also be orchestrating other agents/Orc of Orcs) to collaborate on complex software engineering tasks. It utilizes the Model Context Protocol (MCP) to establish a communication layer between an orchestration server, a proxy, and various client interfaces (CLI, Discord, VS Code).

![WAAAH Banner](docs/assets/banner.png)

## � Starting The WAAAH

Run the orchestration server and bot for your team:

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your tokens (WAAAH_API_KEY, DISCORD_TOKEN or SLACK_* tokens)

# 2. Start with Docker
docker compose up -d waaah-server bot

# Or without Docker
pnpm install && pnpm build
pnpm serve &  # Background
pnpm bot       # Foreground
```

## 🤝 Joining The WAAAH

Connect your AI agent to an existing WAAAH server:

1. **Add MCP config** (e.g., `~/.gemini/antigravity/mcp_config.json`):
   ```json
   {
     "mcpServers": {
       "waaah": {
         "command": "node",
         "args": ["/path/to/WAAAH/packages/mcp-proxy/dist/index.js"],
         "env": {
           "WAAAH_SERVER_URL": "https://your-waaah-server.com",
           "WAAAH_API_KEY": "your_api_key"
         }
       }
     }
   }
   ```

2. **Initialize your agent** with a workflow command (this sets the agent identity):
   - `/waaah-fullstack` → registers as `fullstack-1` (Full Stack Engineer)
   - `/waaah-pm` → registers as `pm-1` (Project Manager)
   - `/waaah-testeng` → registers as `test-1` (Test Engineer)

3. **Start receiving tasks** — the agent enters an autonomous loop via `wait_for_prompt`.

## �🚀 Architecture

```mermaid
graph TD
    User((User/Admin)) -->|Enqueues Tasks| DiscordBot[Discord Bot]
    DiscordBot -->|HTTP| MB[Message Bus / MCP Server]
    
    subgraph "Core System"
        MB[MCP Server]
        MB -->|State| DB[(Agent Registry & Task Queue)]
    end
    
    subgraph "Agent Runtime"
        Proxy[MCP Proxy] -->|Long Polling / Tools| MB
        Agent[Autonomous Agent] -->|Stdio / JSON-RPC| Proxy
    end
```

## 📦 Packages

This is a monorepo managed with `pnpm workspaces`.

- **[`packages/mcp-server`](packages/mcp-server)**: The central orchestration server. Handles agent registration, task queuing, and communication.
- **[`packages/mcp-proxy`](packages/mcp-proxy)**: A bridge that runs locally with the agent, exposing MCP tools via `stdio` and communicating with the server via HTTP.
- **[`packages/bot`](packages/bot)**: Unified Discord/Slack bot for task submission and monitoring.
- **[`packages/types`](packages/types)**: Shared TypeScript definitions and Zod schemas.

## ⚡ WAAAH vs Single-Agent AI

| Feature | WAAAH | Single Agent (e.g., Antigravity) |
|---------|-------|----------------------------------|
| **Agents** | Multiple specialized agents | One agent per session |
| **Delegation** | PM → FullStack → TestEng | N/A |
| **Persistence** | SQLite (tasks, agents, heartbeats) | Conversation only |
| **Integration** | Discord, Slack, CLI | Direct IDE |
| **Remote Control** | Yes (chat bots → HTTP) | Local only |

**Use WAAAH when:** You need a squad of agents collaborating on larger projects.
**Use single agent when:** Interactive pair programming in your IDE.

## 🛠️ Prerequisites

- **Node.js**: v18+
- **PNPM**: All dependencies are managed via pnpm.
- **Docker** (for containerized deployment): [Install Docker](https://docs.docker.com/engine/install/)

## 🏃 Quick Start

1.  **Install & Build**
    ```bash
    pnpm install && pnpm build
    ```

2.  **Start the Server**
    ```bash
    pnpm serve
    ```

3.  **Send a Task via CLI**
    ```bash
    pnpm cli send fullstack-1 "Create a login page"
    pnpm cli list-agents
    ```

## ⚙️ Configuration

1.  Copy the example environment file:
    ```bash
    cp .env.example .env
    ```
2.  Generate an API key:
    ```bash
    openssl rand -hex 32
    ```
3.  Edit `.env` to set your tokens:
    - **`WAAAH_API_KEY`**: Shared secret for server authentication (required for production).
    - **`DISCORD_TOKEN`**: Required for the Discord bot.
    - **`APPROVED_USERS`**: Restrict bot access to specific Discord user IDs.
    - **`DOMAIN_NAME`**: Required for Docker/SSL production setup.

---

## 🚀 Production Deployment (Docker + SSL)

To deploy WAAAH with a persistent database, Nginx reverse proxy, and Let's Encrypt SSL:

1.  **Configure Environment**:
    Make sure `.env` is set up with your `DOMAIN_NAME` and `DISCORD_TOKEN`.

2.  **Initialize SSL Certificates**:
    Run the helper script to generate Let's Encrypt certificates (requires Docker).
    ```bash
    chmod +x init-letsencrypt.sh
    ./init-letsencrypt.sh
    ```

3.  **Start Services**:
    ```bash
    docker compose up -d --build
    ```
    - Server: `https://yourdomain.com`
    - Database: Persisted in `./data`

---

## 🤖 MCP Integration

WAAAH works with any AI system supporting the Model Context Protocol (MCP).

**[📖 Full MCP Integration Guide](docs/MCP_INTEGRATION.md)** - Covers:
- Antigravity (VS Code)
- Claude Desktop
- Cursor / Windsurf
- OpenAI Agents SDK
- Chainlit / Cherry Studio

### Quick Setup (Antigravity)

Add to `~/.gemini/antigravity/mcp_config.json`:

```json
{
  "mcpServers": {
    "waaah": {
      "command": "node",
      "args": ["/path/to/WAAAH/packages/mcp-proxy/dist/index.js"],
      "env": {
        "WAAAH_SERVER_URL": "https://yourdomain.com",
        "WAAAH_API_KEY": "your_api_key"
      }
    }
  }
}
```

> **Note:** Agent identity (`AGENT_ID`, `AGENT_ROLE`) is not required in the config. The workflow command (e.g., `/waaah-fullstack`) explicitly registers the agent with the correct identity.

### Step 2: Initialize Agent

In Antigravity, use one of these workflows:

| Command | Role |
|---------|------|
| `/waaah-fullstack` | Full Stack Engineer |
| `/waaah-pm` | Project Manager |
| `/waaah-testeng` | Test Engineer |

This loads the system prompt and starts the autonomous agent loop.

### Step 3: Send Tasks

From another terminal:
```bash
pnpm cli send fullstack-1 "Implement user authentication"
```

The agent will receive the task via `wait_for_prompt` and execute autonomously.

---

## 📦 Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm serve` | Start MCP orchestration server (Local) |
| `pnpm cli <command>` | CLI for local testing |
| `pnpm bot` | Start Discord bot |
| `docker compose up` | Start full stack (Server + Nginx + DB) |
| `./init-letsencrypt.sh` | Initialize SSL certificates for Docker |
| `pnpm proxy` | Start MCP proxy instance |
| `pnpm build` | Build all packages |

---

## 📂 Packages

- **[`packages/mcp-server`](packages/mcp-server)**: Central orchestration server
- **[`packages/mcp-proxy`](packages/mcp-proxy)**: Stdio↔HTTP bridge for agents
- **[`packages/cli`](packages/cli)**: Command-line interface
- **[`packages/bot`](packages/bot)**: Unified Discord/Slack bot
- **[`packages/types`](packages/types)**: Shared TypeScript definitions

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT

