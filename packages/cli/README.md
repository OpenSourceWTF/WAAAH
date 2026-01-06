# @waaah/cli

Command-line interface for local testing and interaction with the WAAAH orchestration system.

## Installation

```bash
cd packages/cli
pnpm install && pnpm build
```

## Usage

```bash
# Set server URL (defaults to localhost:3000)
export WAAAH_SERVER_URL=http://localhost:3000

# Send a task to a specific agent
node dist/index.js send fullstack-1 "Implement the login page"

# Send with priority
node dist/index.js send fullstack-1 "Fix critical bug" --priority high

# List all registered agents
node dist/index.js list-agents

# Filter agents by role
node dist/index.js list-agents --role full-stack-engineer

# Check agent status
node dist/index.js status fullstack-1

# Debug server state
node dist/index.js debug
```

## Commands

| Command | Description |
|---------|-------------|
| `send <target> <prompt>` | Send task to agent |
| `list-agents` | List registered agents |
| `status <agentId>` | Get agent status |
| `debug` | Show server debug info |
