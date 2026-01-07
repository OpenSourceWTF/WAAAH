# WAAAH Bot

Unified chat bot supporting Discord and Slack for interacting with the WAAAH agent system.

## Setup

### Discord
1. Create a Discord application at [discord.com/developers](https://discord.com/developers/applications)
2. Enable **Message Content Intent** under Bot settings
3. Copy the bot token

```env
DISCORD_TOKEN=your_discord_bot_token
PLATFORM=discord
```

### Slack
1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable Socket Mode and create an app-level token with `connections:write` scope
3. Add `app_mentions:read` and `chat:write` bot scopes
4. Subscribe to `app_mention` events

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
PLATFORM=slack
```

### Getting Channel IDs (Slack)

To configure `SLACK_DELEGATION_CHANNEL_ID`, you need the channel's ID:

1. Right-click the channel name (e.g., `#bot-logs`) → **Copy Link**
2. Paste it. The link looks like: `https://workspace.slack.com/archives/C12345678`
3. The ID is the last segment: **`C12345678`**

**Alternative**: Click the channel name → scroll to the bottom of the "About" tab → copy the **Channel ID**.

> **Note**: The bot must be invited to the channel (`/invite @YourBotName`) to post there.

### Configuring Slash Commands (Optional)

To enable `/waaah` command support:
1. Go to **Slash Commands** in your Slack App settings.
2. Click **Create New Command**.
3. Command: `/waaah`
4. Request URL: (Leave empty if using Socket Mode)
5. Description: "Interact with WAAAH"
6. Usage Hint: `[task description]`
7. Click **Save** and **Reinstall to Workspace**.

### Running Both
```env
PLATFORM=both
```

## Commands

All commands require mentioning the bot first (`@WAAAH` in Discord, `@waaah` in Slack).

| Command | Example | Description |
|---------|---------|-------------|
| `<prompt>` | `@WAAAH Build a login page` | Enqueue task for any available agent |
| `@<role> <prompt>` | `@WAAAH @FullStack Add OAuth` | Route to specific role |
| `update <agent> [name=X] [color=#HEX]` | `@WAAAH update pm-1 color=#FF5733` | Update agent display settings |
| `clear` | `@WAAAH clear` | Clear the task queue |

### Role Aliases

Target agents using their display name or role:
- `@FullStack` → `full-stack-engineer`
- `@PM` → `project-manager`
- `@TestEng` → `test-engineer`
- `@Ops` → `ops-engineer`
- `@Designer` → `designer`

### Priority

Include **urgent** or **critical** in your prompt to set high priority:
```
@WAAAH @FullStack URGENT: Fix production bug
```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `PLATFORM` | `discord`, `slack`, or `both` | No (default: `discord`) |
| `DISCORD_TOKEN` | Discord bot token | For Discord |
| `SLACK_BOT_TOKEN` | Slack bot token | For Slack |
| `SLACK_SIGNING_SECRET` | Slack signing secret | For Slack |
| `SLACK_APP_TOKEN` | Slack app-level token | For Slack |
| `APPROVED_USERS` | Comma-separated user IDs | No |
| `DELEGATION_CHANNEL_ID` | Discord channel for delegation logs | No |
| `SLACK_DELEGATION_CHANNEL_ID` | Slack channel for delegation logs | No |
| `MCP_SERVER_URL` | WAAAH server URL | Yes |
| `WAAAH_API_KEY` | API key for server auth | Yes |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run
PLATFORM=discord pnpm start
```

## Docker

```bash
docker compose up bot
```
