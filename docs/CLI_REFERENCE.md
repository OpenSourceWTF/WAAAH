# WAAAH CLI Reference

The `waaah` CLI (provided by the `@opensourcewtf/waaah-cli` package) is the primary tool for interacting with the WAAAH orchestration server from the command line.

## Usage

```bash
pnpm cli <command> [options]
```

## Commands

### `waaah agent`
Start and manage CLI coding agents with auto-restart and heartbeat monitoring.

**Options:**
- `--start <cli>`: **(Required)** CLI agent to start (e.g., `gemini`, `claude`).
- `--as <workflow>`: Workflow name to run (default: `waaah-orc-loop`).
- `--resume`: Resume previous session if it exists.
- `--max-restarts <n>`: Maximum restart attempts (default: 10).
- `--server <url>`: WAAAH MCP Server URL (default: `http://localhost:3000`).

---

### `waaah answer`
Provide an answer to a blocked task to allow an agent to proceed.

**Arguments:**
- `<taskId>`: The ID of the task that is currently `BLOCKED`.
- `<answer...>`: The textual answer or resolution for the blocker.

---

### `waaah assign`
Assign tasks from a file or an inline prompt. Supports batch creation and dependency detection.

**Arguments:**
- `[file]`: Path to a `tasks.md` or `spec.md` file.

**Options:**
- `-p, --prompt <text>`: Inline prompt (alternative to providing a file).
- `--spec <file>`: Attach a specific specification file.
- `--tasks <file>`: Attach a specific tasks checklist file.
- `--capability <caps...>`: Required agent capabilities (default: `code-writing`).
- `--priority <level>`: Task priority (`normal`, `high`, `critical`).
- `--workspace <id>`: Workspace ID for affinity.
- `--dry-run`: Show what would be created without making changes.

---

### `waaah debug`
Show the current in-memory state of the WAAAH server (Agents and Tasks).

---

### `waaah init`
Initialize the WAAAH project structure in the current directory.

**Options:**
- `-t, --template <type>`: Template type (`minimal` | `standard`, default: `minimal`).
- `-n, --name <name>`: Project name (defaults to current directory name).
- `--force`: Overwrite existing files.

---

### `waaah list-agents` (alias: `list`)
List all agents currently registered with the WAAAH server.

---

### `waaah restart`
Force an agent to restart by sending an eviction signal with a `RESTART` action.

**Arguments:**
- `<agentId>`: The ID of the agent to restart.

**Options:**
- `-r, --reason <reason>`: Reason for the restart.

---

### `waaah send`
Send a specific task prompt to a target agent or role.

**Arguments:**
- `<target>`: Target agent ID or role name.
- `<prompt...>`: The task prompt text.

**Options:**
- `-p, --priority <priority>`: Task priority (default: `normal`).
- `--wait`: Block until the task is completed, failed, or blocked.

---

### `waaah status`
Get the status of agents.

**Arguments:**
- `[agentId]`: (Optional) Specific agent ID to check. If omitted, shows status for all agents.

---

### `waaah sync-skills`
Synchronize workflows between `.agent/workflows/` and `.claude/skills/` using bidirectional symlinks. Orphaned symlinks (pointing to non-existent targets) are removed by default.

**Options:**
- `--no-clean`: Do NOT remove orphaned symlinks.
- `--regenerate`: Remove all existing symlinks and recreate them fresh.

---

### `waaah task`
Show task status summaries or detailed task information.

**Arguments:**
- `[taskId]`: (Optional) Task ID for detailed view.

**Options:**
- `--running`: Show only tasks with `IN_PROGRESS` status.
- `--completed`: Show only tasks with `COMPLETED` status.
- `--all`: Show all tasks including completed ones.
- `-n, --limit <number>`: Limit the number of results displayed (default: 20).
