# @waaah/discord-bot

The user interface for WAAAH. Listens to Discord messages and enqueues them as tasks in the `mcp-server`.

## Features

- **Mention Parsing**: Parses messages like `@FullStack create a login page` to extract:
    - Target Role/Agent (`@FullStack` -> `full-stack-engineer`)
    - Prompt (`create a login page`)
- **Permission System**: Checks if the Discord user is authorized to assign tasks.
- **Task Enqueuing**: POSTs valid tasks to the MCP Server's `/admin/enqueue` endpoint.

## Setup

Requires a Discord Bot Token.

```bash
export DISCORD_TOKEN="your_bot_token"
export MCP_SERVER_URL="http://localhost:3000"
```

## Usage

```bash
node dist/index.js
```
