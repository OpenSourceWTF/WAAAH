# CLI Agent Wrapper - Task Breakdown

## Tasks

### Phase 1: Foundation (Priority: Critical)

- [ ] **T-1: Create `packages/cli-wrapper` package structure**
  - Complexity: S
  - Dependencies: None
  - Create package.json, tsconfig.json, src/ structure

- [ ] **T-2: Implement BaseAgent abstract class**
  - Complexity: M
  - Dependencies: T-1
  - Define interface for PTY spawn, stdin/stdout, lifecycle

- [ ] **T-3: Implement PTY Manager**
  - Complexity: M
  - Dependencies: T-1
  - node-pty integration, spawn/kill, stdin forwarding

- [ ] **T-4: Implement GeminiAgent**
  - Complexity: M
  - Dependencies: T-2, T-3
  - Spawn `gemini` CLI, handle gemini-specific behavior

### Phase 2: MCP Integration (Priority: High)

- [ ] **T-5: Implement MCP Config Scanner**
  - Complexity: M
  - Dependencies: T-1
  - Scan ~/.gemini/settings.json, ~/.claude/...

- [ ] **T-6: Implement MCP Config Injector**
  - Complexity: M
  - Dependencies: T-5
  - Prompt user, inject WAAAH MCP config

- [ ] **T-7: Add CLI login detection**
  - Complexity: S
  - Dependencies: T-4
  - Detect if gemini/claude requires auth

### Phase 3: Workflow & Control (Priority: High)

- [ ] **T-8: Implement Workflow Injector**
  - Complexity: S
  - Dependencies: T-4
  - Read workflow file, send as initial prompt

- [ ] **T-9: Implement Loop Monitor**
  - Complexity: L
  - Dependencies: T-4
  - Parse stdout, detect loop exit, 2-min heartbeat

- [ ] **T-10: Implement Restart Handler**
  - Complexity: M
  - Dependencies: T-9
  - Auto-restart on loop exit or crash

### Phase 4: Session Management (Priority: Medium)

- [ ] **T-11: Implement Session Manager**
  - Complexity: M
  - Dependencies: T-1
  - Save/load session state to .waaah/sessions/

- [ ] **T-12: Implement Crash Recovery**
  - Complexity: M
  - Dependencies: T-11, T-10
  - Restore session on crash, resume workflow

- [ ] **T-13: Implement Graceful Shutdown**
  - Complexity: S
  - Dependencies: T-11
  - Ctrl+C handler, save state, offer resume

### Phase 5: CLI & Polish (Priority: Medium)

- [ ] **T-14: Implement `waaah agent` CLI command**
  - Complexity: M
  - Dependencies: T-4, T-8
  - Parse args, start agent, handle flags

- [ ] **T-15: Implement Git Workspace Detection**
  - Complexity: S
  - Dependencies: T-1
  - Find git root, warn if missing, offer init

- [ ] **T-16: Implement Logger**
  - Complexity: S
  - Dependencies: T-1
  - Log to .waaah/logs/, rotation

- [ ] **T-17: Implement Token Tracker**
  - Complexity: M
  - Dependencies: T-4
  - Parse stdout for token usage

### Phase 6: Dashboard Integration (Priority: Low)

- [ ] **T-18: Add `source` field to agent registration**
  - Complexity: S
  - Dependencies: None (types change)
  - Update RegisterAgentArgs schema

- [ ] **T-19: Update Dashboard to show agent source**
  - Complexity: S
  - Dependencies: T-18
  - Show "CLI" vs "IDE" badge in AgentSidebar

### Phase 7: Claude Support (Priority: Low)

- [ ] **T-20: Implement ClaudeAgent**
  - Complexity: M
  - Dependencies: T-2, T-3
  - Spawn `claude` CLI, handle claude-specific behavior

---

## Suggested Assignment Order

1. T-1 → T-2 → T-3 → T-4 (Foundation)
2. T-14 (CLI entry point - enables testing)
3. T-5 → T-6 → T-7 (MCP)
4. T-8 → T-9 → T-10 (Workflow & Control)
5. T-15 → T-16 (Polish)
6. T-11 → T-12 → T-13 (Session)
7. T-17 → T-18 → T-19 (Dashboard)
8. T-20 (Claude)

---

## Estimated Total: 20 tasks, ~15-20 hours
