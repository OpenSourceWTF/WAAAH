# @opensourcewtf/waaah-cli

Command-line interface for interacting with the WAAAH server.

## Installation

```bash
npm install -g @opensourcewtf/waaah-cli
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WAAAH_SERVER_URL` | `http://localhost:3000` | Server URL |
| `WAAAH_API_KEY` | (none) | API key for auth |

## Commands

### Task Management

```bash
# Send a task to any available agent
waaah send "Implement the login page"

# Send to a specific agent
waaah send orchestrator-1 "Fix the tests"

# Send with priority
waaah send "URGENT: Fix production bug" --priority critical
```

### Agent Management

```bash
# List all registered agents
waaah list-agents

# Check agent status
waaah status orchestrator-1

# Evict an agent
waaah evict orchestrator-1
```

### Queue Management

```bash
# View task queue
waaah queue

# Clear the queue
waaah clear
```

### Debugging

```bash
# Show server debug info
waaah debug

# Interactive mode (watch queue)
waaah
```

## Command Reference

| Command | Description |
|---------|-------------|
| `send [target] <prompt>` | Send task to agent |
| `list-agents` | List registered agents |
| `status <agentId>` | Get agent status |
| `queue` | View task queue |
| `clear` | Clear task queue |
| `evict <agentId>` | Evict an agent |
| `debug` | Show server debug info |

## Development

```bash
pnpm build
pnpm test
```
