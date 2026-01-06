# @waaah/discord-bot

Discord interface for WAAAH. Listens to messages and enqueues tasks to the MCP server.

## Features

- **Role Parsing**: `@FullStack create a login page` → routes to `full-stack-engineer`
- **User Authorization**: `APPROVED_USERS` whitelist for task creation
- **Delegation Notifications**: Posts colored embeds when agents delegate tasks
- **Admin Commands**: `!waaah update`, `!waaah clear`, `!waaah enqueue`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `MCP_SERVER_URL` | No | Server URL (default: `http://localhost:3000`) |
| `WAAAH_API_KEY` | No | API key for server authentication |
| `APPROVED_USERS` | No | Comma-separated Discord user IDs |
| `DELEGATION_CHANNEL_ID` | No | Channel for delegation notifications |
| `AGENTS_CONFIG` | No | Path to agents.yaml |

## Local Development

```bash
export DISCORD_TOKEN="your_token"
export WAAAH_API_KEY="your_api_key"
pnpm build && node dist/index.js
```

## Docker

The bot runs as a Docker service in production:

```bash
docker compose up discord-bot
```

## Commands

| Command | Description |
|---------|-------------|
| `!waaah @Role <prompt>` | Enqueue task to role |
| `!waaah update <agent> [name=X] [color=#HEX]` | Update agent |
| `!waaah clear` | Clear task queue |
