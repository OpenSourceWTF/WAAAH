# CLI Agent Wrapper Specification

**Version:** 1.0  
**Date:** 2026-01-10  
**Status:** Ready for Development

---

## 1. Overview

### Problem Statement

Antigravity (Claude IDE agent) has significant limitations for autonomous agent workflows:
- Pauses long-running jobs
- Can't handle multiple git projects
- Sometimes aborts unexpectedly
- Designed for human-interactive prompting, not autonomous loops

### Target Users

- WAAAH system administrators running autonomous coding agents
- Developers wanting reliable AI agent execution outside IDE

### Solution Summary

A CLI wrapper (`waaah agent`) that spawns and manages external CLI coding agents (gemini, claude) with:
- Full PTY control for reliable execution
- Automatic MCP configuration for WAAAH integration
- Session persistence and crash recovery
- Real-time output streaming
- Loop detection with automatic restart

---

## 2. User Stories

- [ ] **US-1:** As a user, I run `waaah agent --start=gemini --as=orc` and it spawns gemini-cli with WAAAH MCP configured
- [ ] **US-2:** As a user, if MCP isn't configured, I'm prompted for server address and optional API key
- [ ] **US-3:** As a user, if the CLI isn't logged in, I'm notified and given setup instructions
- [ ] **US-4:** As a user, the agent automatically runs the specified workflow (default: waaah-orc)
- [ ] **US-5:** As a user, I see streaming output in real-time
- [ ] **US-6:** As a user, if the agent exits the wait_for_prompt loop, it's automatically restarted
- [ ] **US-7:** As a user, if the agent crashes, my session is recovered automatically
- [ ] **US-8:** As a user, on Ctrl+C the session state is saved and I can resume later
- [ ] **US-9:** As a user, if I'm not in a git repo, I'm warned and offered `git init`
- [ ] **US-10:** As a user, I can see CLI agents in the Dashboard with "CLI" source type
- [ ] **US-11:** As a user, token usage is tracked and logged

---

## 3. Functional Requirements

### 3.1 CLI Interface

- **FR-1.1:** Command: `waaah agent --start=<cli> [--as=<workflow>] [--resume]`
- **FR-1.2:** Supported CLIs: `gemini`, `claude` (extensible)
- **FR-1.3:** Default workflow: `waaah-orc`
- **FR-1.4:** `--resume` flag attempts to restore previous session

### 3.2 MCP Auto-Configuration

- **FR-2.1:** Scan `~/.gemini/settings.json` for gemini MCP config
- **FR-2.2:** Scan `~/.claude/claude_desktop_config.json` for claude MCP config
- **FR-2.3:** If WAAAH MCP not configured, prompt user for:
  - Server address (default: `http://localhost:3456`)
  - API key (optional)
- **FR-2.4:** Inject MCP configuration into appropriate config file
- **FR-2.5:** Detect if CLI requires login, notify user with setup instructions

### 3.3 PTY Execution

- **FR-3.1:** Spawn CLI process in full PTY (using `node-pty`)
- **FR-3.2:** Stream stdout/stderr to terminal in real-time
- **FR-3.3:** Forward stdin from terminal to PTY
- **FR-3.4:** Capture all output for logging and analysis

### 3.4 Workflow Injection

- **FR-4.1:** Read workflow file from `.agent/workflows/<name>.md`
- **FR-4.2:** Send workflow content as initial prompt to CLI
- **FR-4.3:** Track stdout for workflow execution status

### 3.5 Loop Detection & Recovery

- **FR-5.1:** Monitor stdout for signs of loop exit (to be determined empirically)
- **FR-5.2:** Fallback: Inject heartbeat prompt every 2 minutes if no activity
- **FR-5.3:** On detected loop exit, automatically restart with workflow
- **FR-5.4:** On CLI crash (exit code != 0), attempt session recovery

### 3.6 Session Persistence

- **FR-6.1:** Save session state to `.waaah/sessions/<session-id>/`
- **FR-6.2:** Session includes: agent type, workflow, last output, timestamp
- **FR-6.3:** On crash, save state before exit
- **FR-6.4:** `--resume` flag loads latest session for the workspace
- **FR-6.5:** Graceful shutdown (Ctrl+C) saves state and offers resume option

### 3.7 Workspace Detection

- **FR-7.1:** Detect git repository root from current directory
- **FR-7.2:** If not in git repo, warn user that git is recommended
- **FR-7.3:** Offer to run `git init` if user confirms
- **FR-7.4:** Use git root as workspace for agent

### 3.8 Agent Registration

- **FR-8.1:** Add `source: 'CLI' | 'IDE'` field to agent registration
- **FR-8.2:** CLI agents register with `source: 'CLI'`
- **FR-8.3:** Existing Antigravity agents use `source: 'IDE'`
- **FR-8.4:** Dashboard shows source type in agent cards

### 3.9 Token Tracking

- **FR-9.1:** Parse stdout for token usage information (if available)
- **FR-9.2:** Log token counts to session log
- **FR-9.3:** Display cumulative token usage on session end

### 3.10 Logging

- **FR-10.1:** Log all output to `.waaah/logs/<agent>-<timestamp>.log`
- **FR-10.2:** Rotate logs (keep last 10 sessions per agent type)
- **FR-10.3:** Include timestamps in log entries

---

## 4. Non-Functional Requirements

- **NFR-1:** Performance - PTY should add < 10ms latency to output
- **NFR-2:** Reliability - Crash recovery should succeed 95%+ of time
- **NFR-3:** Compatibility - Support Linux and macOS
- **NFR-4:** Security - Warn about plaintext API keys in config files

---

## 5. Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| CLI not installed | Error: "gemini CLI not found. Install with: npm install -g @google/gemini-cli" |
| CLI not logged in | Error: "gemini requires login. Run: gemini auth" |
| MCP server unreachable | Warning: "Cannot connect to WAAAH server. Agent will run without MCP." |
| PTY spawn fails | Error with system details, suggest checking permissions |
| Session file corrupted | Warning, start fresh session |
| Ctrl+C during task | Save state, confirm exit or continue |
| Network disconnect | Continue with buffered state, retry MCP on reconnect |

---

## 6. Out of Scope

- Browser automation for CLI login
- Multiple simultaneous agents (run separate processes)
- Windows support (v1)
- API fallback when CLI unavailable
- Custom MCP tool injection beyond WAAAH

---

## 7. Open Questions (RESOLVED)

| Question | Resolution | Date |
|----------|------------|------|
| Exact stdout signature for loop exit | Monitor for `Exiting`, `Goodbye`, or 30s silence after prompt completion | 2026-01-11 |
| Token parsing format for gemini vs claude | Gemini: parse `/\d+ tokens used/`. Claude: parse `usage:` JSON. Fallback: estimate from output length | 2026-01-11 |

---

## 8. Success Metrics

- **M-1:** Agent stays in loop for 30+ minutes without manual intervention
- **M-2:** Crash recovery succeeds within 30 seconds
- **M-3:** Session resume works after terminal close
- **M-4:** MCP tools work correctly from CLI agent

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        waaah agent CLI                          │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────┤
│ Config      │ PTY         │ Session     │ Loop        │ Logger  │
│ Manager     │ Manager     │ Manager     │ Monitor     │         │
├─────────────┴──────┬──────┴─────────────┴──────┬──────┴─────────┤
│                    │                           │                │
│    ┌───────────────▼───────────────┐   ┌───────▼───────┐        │
│    │     gemini/claude CLI         │   │ WAAAH MCP     │        │
│    │     (PTY subprocess)          │◀──│ Server        │        │
│    └───────────────────────────────┘   └───────────────┘        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Package Structure

```
packages/cli-wrapper/
├── src/
│   ├── index.ts           # CLI entry point
│   ├── agents/
│   │   ├── base.ts        # BaseAgent abstract class
│   │   ├── gemini.ts      # GeminiAgent implementation
│   │   └── claude.ts      # ClaudeAgent implementation
│   ├── pty/
│   │   └── manager.ts     # PTY lifecycle management
│   ├── session/
│   │   └── manager.ts     # Session persistence
│   ├── config/
│   │   └── mcp-injector.ts # MCP config injection
│   ├── monitor/
│   │   └── loop-detector.ts # Loop exit detection
│   └── utils/
│       ├── git.ts         # Git workspace detection
│       └── logger.ts      # Logging utilities
├── package.json
└── tsconfig.json
```
