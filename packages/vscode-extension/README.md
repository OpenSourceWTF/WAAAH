# WAAAH Agent Bridge - VS Code Extension

A proof-of-concept VS Code extension that enables CLI-to-Antigravity-chat communication.

## Features

- **HTTP Bridge Server**: Listens on localhost for commands
- **Agent Identification**: Each agent has a unique ID based on workspace + port
- **CLI Tool**: Send commands from terminal to Antigravity chat

## Installation

```bash
cd packages/vscode-extension
npm install
npm run compile
```

Then install in Antigravity:
1. Package the extension: `npx vsce package`
2. Install: `Ctrl+Shift+P` → "Install from VSIX"

Or for development:
1. Open this folder in Antigravity
2. Press `F5` to launch Extension Development Host

## Configuration

Add to your settings.json:

```json
{
  "waaah.agentId": "my-dev-agent",    // Optional: custom agent ID
  "waaah.agentRole": "developer",      // Role description
  "waaah.bridgePort": 9876,           // HTTP server port
  "waaah.autoStart": true             // Start server on activation
}
```

## API Endpoints

The extension runs an HTTP server on `http://127.0.0.1:9876` (default).

### GET /status
Returns agent information.

```bash
curl http://localhost:9876/status
```

Response:
```json
{
  "status": "active",
  "agent": {
    "id": "agent-abc123",
    "role": "developer",
    "port": 9876,
    "workspacePath": "/home/user/myproject",
    "startedAt": "2024-01-06T12:00:00.000Z"
  }
}
```

### GET /health
Simple health check.

```bash
curl http://localhost:9876/health
```

### POST /submit
Submit a message to Antigravity chat.

```bash
curl -X POST http://localhost:9876/submit \
  -H "Content-Type: application/json" \
  -d '{"message": "Build a hello world app"}'
```

With agent verification:
```bash
curl -X POST http://localhost:9876/submit \
  -H "Content-Type: application/json" \
  -d '{"message": "Build a hello world app", "targetAgent": "agent-abc123"}'
```

## CLI Tool

```bash
# Make CLI executable
chmod +x bin/waaah-cli.js

# Submit a command
./bin/waaah-cli.js submit "Build a hello world app"

# Check agent status
./bin/waaah-cli.js status

# Discover running agents
./bin/waaah-cli.js discover

# Target specific port
./bin/waaah-cli.js submit "Fix the bug" --port 9877

# Target specific agent
./bin/waaah-cli.js submit "Deploy" --agent agent-abc123
```

## Running Multiple Agents

To run multiple agents, configure different ports:

**Agent 1 (Developer):**
```json
{
  "waaah.agentId": "dev-agent",
  "waaah.agentRole": "developer", 
  "waaah.bridgePort": 9876
}
```

**Agent 2 (PM):**
```json
{
  "waaah.agentId": "pm-agent",
  "waaah.agentRole": "project-manager",
  "waaah.bridgePort": 9877
}
```

## Architecture

```
┌─────────────┐     HTTP POST      ┌──────────────────┐
│   CLI /     │ ──────────────────▶│  WAAAH Extension │
│   Discord   │    /submit         │  (HTTP Server)   │
└─────────────┘                    └────────┬─────────┘
                                            │
                                            ▼
                               ┌────────────────────────┐
                               │ vscode.commands.       │
                               │ executeCommand(        │
                               │   'workbench.action.   │
                               │    chat.submit'        │
                               │ )                      │
                               └────────────────────────┘
                                            │
                                            ▼
                               ┌────────────────────────┐
                               │   Antigravity Chat     │
                               │   (Gemini Agent)       │
                               └────────────────────────┘
```

## VS Code Commands

- `WAAAH: Start Agent Bridge Server` - Start the HTTP server
- `WAAAH: Stop Agent Bridge Server` - Stop the HTTP server  
- `WAAAH: Show Bridge Status` - Display agent info

## Response Capture (HTTP Callback)

When the CLI sends a task, it includes a `[TASK:task-xxx]` prefix. The agent responds back via HTTP:

### Agent Response Script
```bash
# After completing the task, agent calls:
./bin/waaah-respond.js task-1234-abc "Completed: created hello.py"
```

### Or via curl
```bash
curl -X POST http://localhost:9876/respond/task-1234-abc \
  -H "Content-Type: application/json" \
  -d '{"response": "Completed: created hello.py"}'
```

### Flow
```
┌─────────┐  POST /submit   ┌────────────────┐  chat.submit  ┌────────────────┐
│   CLI   │ ───────────────▶│   Extension    │ ────────────▶ │   Antigravity  │
│  (you)  │  {message}      │  (HTTP server) │               │    (agent)     │
└─────────┘                 └───────┬────────┘               └───────┬────────┘
     ▲                              │                                │
     │                              │                                │
     │     GET /task/:id            │        POST /respond/:id       │
     │◀─────── poll ────────────────│◀───────────────────────────────┘
     │                              │        {response: "..."}
```

## Workflow Integration

The agent follows `/waaah-respond` workflow to detect `[TASK:xxx]` and respond.

## Next Steps

For the full WAAAH system:
1. Connect to MCP server for multi-agent orchestration
2. Add Discord bot integration
3. Implement task queue persistence
