# @opensourcewtf/waaah-cli

Unified command-line interface for WAAAH: task management and agent spawning.

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

### Agent Management

```bash
# Start a Gemini agent with default orchestrator workflow
waaah agent --start gemini

# Start with specific workflow
waaah agent --start gemini --as waaah-orc-agent

# Start Claude agent
waaah agent --start claude

# Resume previous session
waaah agent --start gemini --resume

# Dry run (show command without executing)
waaah agent --start gemini --dry-run
```

### Task Management

```bash
# Send a task to any available agent
waaah send "Implement the login page"

# Send to a specific agent
waaah send orchestrator-1 "Fix the tests"

# Send with priority
waaah send "URGENT: Fix production bug" --priority critical

# List agents
waaah list

# Check agent status
waaah status orchestrator-1
```

### Queue Management

```bash
# View debug info
waaah debug

# Interactive mode (watch queue)
waaah
```

## Command Reference

| Command | Description |
|---------|-------------|
| `agent --start <cli>` | Start agent (gemini, claude) |
| `send [target] <prompt>` | Send task to agent |
| `list` | List registered agents |
| `status <agentId>` | Get agent status |
| `debug` | Show server debug info |
| `answer <taskId> <answer>` | Answer a blocked task |
| `task <action>` | Task management |

## Agent Adapters

The CLI supports multiple AI agent CLIs:

| CLI | Status | Notes |
|-----|--------|-------|
| `gemini` | ✅ | Full support |
| `claude` | ✅ | Full support |

## Development

```bash
pnpm build
pnpm test
```
