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

## User Comments (Mailbox)

**Live comments** from users during task execution are delivered via `update_progress`.

### Flow

1. User posts comment via dashboard while agent is working
2. Comment stored as **unread** (`isRead = false`)
3. Agent calls `update_progress()` periodically
4. Response includes `unreadComments` array if any exist
5. Comments automatically marked as **read** after delivery

### Agent Response Example

```json
{
  "recorded": true,
  "unreadComments": [
    {
      "id": "msg-abc",
      "content": "Please also handle the edge case for empty arrays",
      "timestamp": 1736700000000,
      "metadata": { "messageType": "comment" }
    }
  ]
}
```

### Agent Handling

```
1. Call update_progress({ phase, message })
2. Check response.unreadComments
3. If comments exist:
   a. Read each comment
   b. Address the feedback
   c. Call update_progress() with response
4. Continue work
```

**Key Point**: Agents should call `update_progress` regularly to receive user feedback.

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
6. **Never ignore comments** - Check `unreadComments` in every tool response

---

## Anti-Patterns

| ❌ DO NOT | ✅ DO THIS |
|-----------|-----------|
| BUILD → COMPLETED | BUILD → IN_REVIEW → APPROVED → MERGE → COMPLETED |
| Skip IN_REVIEW | Always wait for approval |
| SMOKE before merge | Run SMOKE only after merge succeeds |
| COMPLETED without merge | Call COMPLETED only after push to main |
| "Already done" → COMPLETED | Submit to IN_REVIEW with proof |
| "No changes needed" → COMPLETED | Document findings → IN_REVIEW → approval |
| Push directly to main | Push to feature branch first |

---

## Block Conditions

When to use each `block_task` reason:

| Condition | Reason | Example |
|-----------|--------|---------|
| Ambiguous requirements | `clarification` | "Should X handle case Y?" |
| Security concern | `decision` | "This requires admin access" |
| 10+ test failures | `dependency` | "Upstream module broken" |
| Missing API/credentials | `dependency` | "Need API key for service" |
| Conflicting requirements | `clarification` | "Spec says A, tests expect B" |

---

## TDD Loop

For each criterion in the task:

```
1. WRITE failing test
2. IMPLEMENT until test passes
3. CALL update_progress()
4. REPEAT for next criterion
```

---

## Quality Gates

**Run before submitting:**

```bash
pnpm test --coverage  # REQUIRE ≥90%
pnpm typecheck && pnpm lint
```

| Gate | Threshold |
|------|-----------|
| Test coverage | ≥90% |
| TypeScript | No errors |
| Lint | No errors |

---

## Submit Checklist

**Verify before calling `send_response(IN_REVIEW)`:**

- [ ] Working in feature branch (NOT main)?
- [ ] Committed changes to feature branch?
- [ ] Tests passing locally?
- [ ] Coverage ≥90%?
- [ ] Diff not empty?

**If ANY answer is NO → go back to BUILD.**

### Diff Validation

```bash
git fetch origin main
git diff origin/main...HEAD > .waaah/orc/latest.diff

# Validate diff is not empty
DIFF_SIZE=$(wc -c < .waaah/orc/latest.diff)
if [ "$DIFF_SIZE" -lt 20 ]; then
  echo "[ERROR] Diff too small"
  # STOP AND FIX
fi
```

---

## Rejection Workflow

When task is rejected:

```
1. READ rejection feedback from task context
2. CHECK unreadComments for [REJECT] prefix
3. CALL get_review_comments() → fetch code-level feedback
4. FOR each comment:
   a. FIX the issue at specified file/line
   b. CALL resolve_review_comment({ commentId })
5. RUN tests
6. CALL send_response(IN_REVIEW)
```

---

## SMOKE Phase

**Post-merge verification (after APPROVED → MERGE):**

### Checklist

- [ ] Went through IN_REVIEW (not skipped)?
- [ ] Received APPROVED status?
- [ ] Merged changes to main?
- [ ] `git log origin/main --oneline | head -1` shows your commit?
- [ ] Dependencies still work?

### Verification

```
IF task.dependencies → verify each still works
IF task.verify → run verify command; if fail → revert and block

# Grumpy check
"Can a stranger run [cmd] and see [output]?"
IF no → NOT DONE

# Stub check
grep -r "TODO\|Not implemented" [files]
IF found → NOT DONE
```

---

## Merge Conflict Resolution

```bash
if ! git merge --no-ff $BRANCH -m "Merge $BRANCH"; then
  echo "MERGE CONFLICT DETECTED"
  
  # Identify conflicts
  git status --porcelain | grep "^UU"
  
  # For lockfile conflicts
  git checkout --ours pnpm-lock.yaml && pnpm install
  
  # Verify
  pnpm build && pnpm test
  
  # If success
  git add . && git commit --no-edit
  
  # If failure
  block_task("Merge conflict - human resolution required")
fi
```

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

