# Antigravity Setup Guide

This guide covers setting up WAAAH agents with [Antigravity](https://cloud.google.com/antigravity) (VS Code AI coding assistant).

## Quick Start

### 1. Copy Workflow Directory

Copy the WAAAH agent workflows to your project:

```bash
# From your project root
cp -r /path/to/WAAAH/.agent .

# Add to .gitignore (optional but recommended)
echo ".agent/" >> .gitignore
```

This gives you access to the `/waaah-*` slash commands in Antigravity.

### 2. Configure MCP

Add to `~/.gemini/antigravity/mcp_config.json`:

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

### 3. Start the WAAAH Server

```bash
cd /path/to/WAAAH
pnpm serve
```

---

## Agent Roles & Workflows

V7 unifies all agent roles into a single **Orchestrator** agent.

| Workflow | Role | Description |
|----------|------|-------------|
| `/waaah-orc` | Orchestrator | The universal agent that can plan, code, and test |
| `/waaah-assign` | Assigner | CLI helper to assign tasks |

### Orchestrator Agent

The `/waaah-orc` agent enters an **autonomous task loop**:
1. Registers with the WAAAH server
2. Waits for tasks via `wait_for_prompt`
3. Executes tasks autonomously (creating Git worktrees)
4. Reports results via `send_response`
5. Loops back to step 2

**Start an agent**: Open a new Antigravity conversation and run:
```
/waaah-orc
```

---

## Spinning Up Agents

### Single Window (Recommended)

1. Open a new Antigravity chat panel.
2. Run `/waaah-orc`.
3. Use the CLI in your terminal to assign tasks:
   ```bash
   waaah assign "Implement feature X"
   ```

### Multiple Agents

To scale up, open multiple Antigravity windows/panels and run `/waaah-orc` in each. The system will distribute tasks automatically.

---

## Workflow Directory Structure

```
your-project/
├── .agent/
│   └── workflows/
│       ├── waaah-orc.md         # The Master Workflow
│       └── waaah-assign.md      # CLI Assignment Helper
└── .gitignore                   # Add: .agent/
```

### Adding to .gitignore

The `.agent/` directory contains workflow prompts that may include project-specific customizations. Add to `.gitignore`:

```gitignore
# WAAAH agent workflows (customize locally)
.agent/
```

---

## Example: Feature Development

1. **Start the server**: `pnpm serve`

2. **Open a VS Code window** on your project

3. **Start an Agent**:
   - Open Chat
   - Run `/waaah-orc`

4. **Assign Work**:
   ```bash
   waaah assign "Implement user authentication with JWT"
   ```

5. **Monitor via Dashboard**: `http://localhost:3000/admin`

---

## Tips for Antigravity

- **Gemini works best**: WAAAH was developed with Gemini. Claude may escape wait loops.
- **Use the Dashboard**: Real-time visibility at `/admin` helps track agent status.
- **Customize workflows**: Edit `.agent/workflows/*.md` to tune agent behavior for your project.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `/waaah-*` commands not found | Copy `.agent/` directory to your project root |
| Agent not registering | Check MCP config and `WAAAH_API_KEY` |
| Agent stuck in "OFFLINE" | Restart the Antigravity session |
| Multiple agents same ID | Agents now auto-generate IDs |
