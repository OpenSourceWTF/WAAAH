# WAAAH Workflow

**Work Anywhere Autonomous Agent Hub** - Agent workflow reference.

---

## Task Lifecycle

```
QUEUED → PENDING_ACK → IN_PROGRESS → IN_REVIEW → APPROVED → COMPLETED
              ↑            ↓              ↓
           timeout      BLOCKED       (reject)
                           ↓              ↓
                      (answer)       QUEUED
```

### Statuses

| Status | Meaning |
|--------|---------|
| `QUEUED` | Task waiting for agent assignment |
| `PENDING_ACK` | Agent reserved, waiting for ACK (30s timeout) |
| `IN_PROGRESS` | Agent actively working |
| `BLOCKED` | Agent needs clarification/decision |
| `IN_REVIEW` | Code submitted, awaiting human approval |
| `APPROVED_QUEUED` | User approved, waiting for agent pickup |
| `APPROVED_PENDING_ACK` | Agent picked up approval, waiting for ACK |
| `REJECTED` | Transient - immediately transitions to `QUEUED` |
| `COMPLETED` | Task finished successfully |
| `FAILED` | Task failed (error/crash) |
| `CANCELLED` | Task cancelled by user |

---

## Agent Capabilities

Agents are matched to tasks by **capabilities**, not roles.

| Capability | Description |
|------------|-------------|
| `spec-writing` | Planning, specifications, design |
| `code-writing` | Implementation, development |
| `test-writing` | Testing, QA, verification |
| `doc-writing` | Documentation |
| `code-doctor` | Code review, static analysis (read-only) |
| `general-purpose` | Fallback for unclassified tasks |

**Scoring**: `matched_capabilities / total_agent_capabilities`  
Specialists (2/2 match) beat generalists (2/4 match).

---

## MCP Tools

### Agent Lifecycle

| Tool | Purpose |
|------|---------|
| `register_agent` | Register with the server (requires `workspaceContext`) |
| `wait_for_prompt` | Long-poll for task assignment (290s default) |
| `ack_task` | Acknowledge task pickup |
| `send_response` | Submit task result with status |
| `update_progress` | Report step-by-step progress |

### Task Operations

| Tool | Purpose |
|------|---------|
| `get_task_context` | Retrieve full task details |
| `block_task` | Mark task as blocked with question |
| `answer_task` | Unblock a blocked task |
| `wait_for_task` | Wait for a specific task to complete (dependencies) |
| `assign_task` | Create a new task (delegation) |

### Code Review

| Tool | Purpose |
|------|---------|
| `scaffold_plan` | Generate implementation plan skeleton |
| `submit_review` | Submit code for review |
| `get_review_comments` | Fetch unresolved review comments |
| `resolve_review_comment` | Mark comment as addressed |

### Admin

| Tool | Purpose |
|------|---------|
| `list_agents` | List registered agents (filter by capability) |
| `get_agent_status` | Check agent status |
| `admin_update_agent` | Update agent metadata |
| `broadcast_system_prompt` | Send system-wide prompts |

---

## Workspace Context

Agents **MUST** declare their workspace at registration:

```json
{
  "type": "github",
  "repoId": "Owner/RepoName",
  "branch": "main",
  "path": "/local/path"
}
```

Tasks route to agents with matching `repoId`.

---

## Happy Path

```
1. register_agent({ workspaceContext, capabilities })
2. LOOP:
   a. wait_for_prompt(290s) → task assigned
   b. ack_task()
   c. get_task_context() → read spec
   d. update_progress(phase="PLANNING")
   e. [write code in git worktree]
   f. update_progress(phase="BUILDING")
   g. [run tests]
   h. send_response({ status: "IN_REVIEW", diff: "..." })
   i. → WAIT for approval
   j. [if approved] merge & cleanup
   k. send_response({ status: "COMPLETED" })
   l. GOTO 2
```

---

## Blocking

When stuck, call `block_task`:

```typescript
block_task({
  taskId: "...",
  reason: "clarification" | "dependency" | "decision",
  question: "What should X do in case Y?",
  summary: "Completed A, B. Stuck on C."
})
```

User answers via dashboard → task transitions to `IN_PROGRESS`.

---

## Review Comments

1. User leaves **review comments** on specific lines in diff viewer
2. User clicks **REJECT** → task returns to `QUEUED` with feedback
3. Agent picks up task, calls `get_review_comments`
4. Agent fixes each comment, calls `resolve_review_comment`
5. Agent re-submits with `send_response(IN_REVIEW)`

---

## Diff Submission

**REQUIRED** for code tasks:

```bash
git diff origin/main...HEAD > diff.txt
```

Pass to `send_response`:

```typescript
send_response({
  taskId: "...",
  status: "IN_REVIEW",
  message: "Summary of changes...",
  diff: "<raw diff content>"
})
```

The server stores the diff for dashboard review.

---

## Key Rules

1. **Always ACK** - Never skip `ack_task` after receiving a task
2. **Always IN_REVIEW** - Never skip review, even for "simple" tasks
3. **Always worktrees** - Never commit to `main` directly
4. **Always diff** - Always include `diff` in `send_response(IN_REVIEW)`
5. **Always complete after merge** - Only call `COMPLETED` after pushing to `main`

---

## Timing Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `AGENT_WAIT_TIMEOUT` | 290s | Long-poll timeout |
| `ACK_TIMEOUT` | 30s | Time to ACK before requeue |
| `AGENT_OFFLINE_THRESHOLD` | 5min | Heartbeat stale threshold |
| `SCHEDULER_INTERVAL` | 2s | Assignment check frequency |

---

## Priority Levels

| Priority | Behavior |
|----------|----------|
| `critical` | Processed first |
| `high` | Before normal |
| `normal` | Default |

---

## Dependencies

Tasks can depend on other tasks:

```typescript
assign_task({
  prompt: "Implement feature B",
  dependencies: ["task-A-id", "task-C-id"]
})
```

Task remains `QUEUED` until all dependencies are `COMPLETED`.
