# @waaah/cli

Command-line interface for local testing and interaction with the WAAAH system.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WAAAH_SERVER_URL` | `http://localhost:3000` | Server URL |
| `WAAAH_API_KEY` | (none) | API key for authentication |

## Usage

```bash
# Set environment
export WAAAH_SERVER_URL=http://localhost:3000
export WAAAH_API_KEY=your_key

# Interactive mode (async, background listener)
pnpm cli

# Send a task
pnpm cli send fullstack-1 "Implement the login page"

# Send with priority
pnpm cli send fullstack-1 "Fix critical bug" --priority high

# List agents
pnpm cli list-agents

# Check agent status
pnpm cli status fullstack-1

# Debug server state
pnpm cli debug
```

## Commands

| Command | Description |
|---------|-------------|
| `send <target> <prompt>` | Send task to agent |
| `list-agents` | List registered agents |
| `status <agentId>` | Get agent status |
| `debug` | Show server debug info |
