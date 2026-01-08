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

WAAAH includes pre-built workflow directives for specialized agents:

| Workflow | Role | Description |
|----------|------|-------------|
| `/waaah-fullstack` | Full Stack Engineer | Implements features, writes code, creates PRs |
| `/waaah-tester` | Test Engineer | Writes tests, validates code, ensures coverage |
| `/waaah-pm` | Project Manager | Plans work, writes specs, coordinates tasks |
| `/waaah-boss` | **Boss / Tech Lead** | Orchestrates other agents (see below) |

### Worker Agents (FullStack, Tester, PM)

These agents enter an **autonomous task loop**:
1. Register with the WAAAH server
2. Wait for tasks via `wait_for_prompt`
3. Execute tasks autonomously
4. Report results via `send_response`
5. Loop back to step 2

**Start a worker agent**: Open a new Antigravity conversation and run:
```
/waaah-fullstack
```

### Boss Agent (Special Role)

The `/waaah-boss` workflow is different—it's an **orchestrator of orchestrators**.

- Does NOT enter a wait loop
- Pair programs with YOU directly
- Delegates tasks to worker agents
- Monitors progress and coordinates work

**Use the Boss when you want to:**
- Plan and delegate a complex feature across multiple agents
- Monitor your agent fleet
- Manually trigger specific agent actions

```
/waaah-boss
```

---

## Spinning Up Agents

### Option A: Multiple VS Code Windows

Open separate VS Code windows for each agent:

1. **Window 1** - Your main workspace (Boss)
   - Run `/waaah-boss` to pair program with you
   
2. **Window 2** - FullStack agent
   - Open same or different repo
   - Run `/waaah-fullstack`
   
3. **Window 3** - Tester agent
   - Open same repo
   - Run `/waaah-tester`

Each window runs its own Antigravity session with a dedicated agent.

### Option B: New Conversations in Same Window

In a single VS Code window, open multiple Antigravity chat panels:

1. Open Antigravity sidebar
2. Click "New Conversation" 
3. Run `/waaah-fullstack` in the new conversation
4. Repeat for other agents

> **Note:** This works but can be harder to track. Multiple windows is recommended.

---

## Workflow Directory Structure

```
your-project/
├── .agent/
│   └── workflows/
│       ├── waaah-boss.md        # Orchestrator (pair with you)
│       ├── waaah-fullstack.md   # Full Stack Engineer loop
│       ├── waaah-tester.md      # Test Engineer loop
│       ├── waaah-pm.md          # Project Manager loop
│       ├── waaah-check-task.md  # Check task status
│       ├── waaah-delegate.md    # Manual delegation
│       └── waaah-respond.md     # Send response to CLI
└── .gitignore                   # Add: .agent/
```

### Adding to .gitignore

The `.agent/` directory contains workflow prompts that may include project-specific customizations. Add to `.gitignore`:

```gitignore
# WAAAH agent workflows (customize locally)
.agent/
```

---

## Example: Multi-Agent Feature Development

1. **Start the server**: `pnpm serve`

2. **Open 3 VS Code windows** on your project

3. **Window 1 (You + Boss)**:
   ```
   /waaah-boss
   ```
   Plan your feature and delegate:
   ```
   @WAAAH @FullStack "Implement user authentication with JWT"
   @WAAAH @TestEng "Write tests for auth module when FullStack completes"
   ```

4. **Window 2 (FullStack)**:
   ```
   /waaah-fullstack
   ```
   Agent waits for tasks, then executes autonomously.

5. **Window 3 (Tester)**:
   ```
   /waaah-tester
   ```
   Agent waits for test requests.

6. **Monitor via Dashboard**: `http://localhost:3000/admin`

---

## Tips for Antigravity

- **Gemini works best**: WAAAH was developed with Gemini. Claude may escape wait loops.
- **Keep Boss active**: The Boss doesn't loop—keep that conversation active for coordination.
- **Use the Dashboard**: Real-time visibility at `/admin` helps track agent status.
- **Customize workflows**: Edit `.agent/workflows/*.md` to tune agent behavior for your project.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `/waaah-*` commands not found | Copy `.agent/` directory to your project root |
| Agent not registering | Check MCP config and `WAAAH_API_KEY` |
| Agent stuck in "OFFLINE" | Restart the Antigravity session |
| Multiple agents same ID | Each window should use different workflow |
