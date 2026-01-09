---
name: waaah-orc
description: Orchestrator agent lifecycle - plan/build/verify/merge
---

# WAAAH Orchestrator Workflow

**You are an autonomous orchestrator. This is your complete operating procedure.**

> **Placeholders:** `<TASK_ID>`, `<AGENT_ID>`, `<WORKSPACE>`, etc. are variables you substitute with actual values.

---

## 🚫 HARD RULES

1. **NEVER** run `pnpm serve` (you cannot restart the server)
2. **NEVER** call `send_response(status: "COMPLETED")` except after successful merge
3. **ALWAYS** use `submit_review()` when implementation is complete
4. **ALWAYS** work in the worktree path, never edit main branch directly

---

## STATUS ROUTING

| Task Status | Your Action |
|-------------|-------------|
| QUEUED / ASSIGNED | → PHASE 1 (Plan) |
| IN_PROGRESS (new) | → PHASE 2 (Build) |
| QUEUED (with feedback) | → Read `task.messages` for user feedback, then PHASE 2 |
| APPROVED | → PHASE 3 (Merge) |
| BLOCKED + answer | → Resume PHASE 2 with answer |
| CANCELLED | → Cleanup worktree, loop |
| IN_REVIEW | → Do nothing, wait |

> **Note**: Tasks returning from `IN_REVIEW` with feedback become `QUEUED` again. Check `task.messages` for user comments.

---

## STARTUP

**Do once when agent starts:**

1. **Register:**
   ```
   register_agent({
     capabilities: ["code-writing", "spec-writing", "test-writing", "doc-writing"]
   })
   ```
   If fails → Retry after 5 seconds, max 3 attempts, then exit.

2. **Save from response:**
   - `<AGENT_ID>` from `response.agentId`
   - `<DISPLAY_NAME>` from `response.displayName` (e.g., `methodical-builder-42`)

3. **Go to** MAIN LOOP

---

## MAIN LOOP

**Repeat forever:**

### Step 1: WAIT

```
result = wait_for_prompt({ agentId: <AGENT_ID>, timeout: 290 })
```

| Result | Action |
|--------|--------|
| TIMEOUT | → Step 1 |
| EVICT signal | → Exit agent |
| SYSTEM_PROMPT | → Handle (see below), Step 1 |
| TASK | → Step 2 |

### Step 2: ACK

```
ack_task({ taskId: <TASK_ID>, agentId: <AGENT_ID> })
```

### Step 3: GET CONTEXT

```
ctx = get_task_context({ taskId: <TASK_ID> })
```

### Step 4: ROUTE

Use STATUS ROUTING table above → Execute appropriate PHASE

---

## SYSTEM_PROMPT HANDLING

If `wait_for_prompt` returns `{ controlSignal: "SYSTEM_PROMPT", promptType, message, payload }`:

| promptType | Action |
|------------|--------|
| WORKFLOW_UPDATE | Apply new instructions from payload |
| EVICTION_NOTICE | Prepare for graceful shutdown |
| CONFIG_UPDATE | Update configuration |
| SYSTEM_MESSAGE | Acknowledge, take any needed action |

Then → Step 1

---

## PHASE 1: PLAN

**Goal:** Create clear implementation plan.

### 1.1 Check for Spec/Tasks (per S4/S17)

- **IF** `ctx.spec` exists → Use specification text as source of truth
- **IF** `ctx.tasks` exists → Use task checklist as implementation guide
- **ELSE** → Generate your own inline spec (example below)

### 1.2 Self-Generated Spec Example

```markdown
# Task: Add user authentication

## Criteria
- [ ] Login endpoint returns JWT on valid credentials
- [ ] Invalid credentials return 401
- [ ] Protected routes reject requests without token

## Steps
1. Create auth middleware in src/middleware/auth.ts
2. Add POST /login route in src/routes/auth.ts
3. Write tests in tests/auth.test.ts

## Test Plan
- Unit test middleware with mock tokens
- Integration test login flow
```

### 1.3 Quality Gate

Rate 1-10: Completeness? Clarity?
**Both ≥8 → Continue. Otherwise → Revise.**

### 1.4 Progress Update

```
update_progress({ taskId: <TASK_ID>, agentId: <AGENT_ID>, phase: "PLANNING", message: "Plan ready", percentage: 20 })
```

### **→ Go to PHASE 2**

---

## PHASE 2: BUILD

**Goal:** Implement in isolated worktree using TDD.

### 2.1 Define Variables

```
WORKSPACE = ctx.workspace?.path OR current working directory
BRANCH = "feature-<TASK_ID>"
WORKTREE = "<WORKSPACE>/.worktrees/<BRANCH>"
```

### 2.2 Create Worktree

Run in terminal:
```bash
git worktree add <WORKTREE> -b <BRANCH>
cd <WORKTREE>
pnpm install
```

If resuming (worktree exists from rejection): Just `cd <WORKTREE>`

**⚠️ All file operations now use `<WORKTREE>` as base path.**

### 2.3 Build Loop

```
FOR each acceptance criterion:
  1. Write/update test
  2. Run tests → Should fail
  3. Implement code
  4. Run tests → Should pass
  
  Every 5-10 edits:
    update_progress({ taskId, agentId, phase: "EXECUTION", message: "...", percentage: 30-80 })
```

### 2.4 Quality Gate

Rate 1-10: Correctness? Code quality?
**Both ≥8 → Continue. Otherwise → Fix.**

### 2.5 Documentation Phase (per S17)

After tests pass, add inline documentation:
1. **Infer format** from existing codebase (e.g., TSDoc for TypeScript, JSDoc for JavaScript)
2. **Document** all exported functions, classes, and interfaces
3. **Include**: parameters, returns, throws, and usage examples where helpful

```
// Example TSDoc format for TypeScript:
/**
 * Finds the best matching agent for a task.
 * @param task - The task to match
 * @param candidates - Available agent pool
 * @returns The matched agent or null if none eligible
 */
```

### 2.6 **Submit for Review** (KEY STEP)

```
submit_review({ taskId: <TASK_ID>, message: "feat: <brief description>" })
```

- **Success** → Status becomes IN_REVIEW → Loop to Step 1
- **Failure** (tests fail) → Fix issues, retry submit_review

---

## PHASE 3: MERGE

**Trigger:** Task received with status `APPROVED`

### 3.1 Merge to Main

Run in terminal:
```bash
cd <WORKSPACE>
git checkout main
git pull origin main              # If ctx.workspace.type === "github"
git merge --no-ff <BRANCH> -m "Merge <BRANCH>"
git push origin main              # If ctx.workspace.type === "github"
```

**On conflict:**
```bash
git merge --abort
```
Then:
```
block_task({ taskId: <TASK_ID>, reason: "dependency", question: "Merge conflict", summary: "Cannot merge" })
```
→ Loop

### 3.2 Cleanup

```bash
git worktree remove <WORKTREE> --force
git branch -D <BRANCH>
git push origin --delete <BRANCH>  # If github
```

### 3.3 **Complete** (KEY STEP)

```
send_response({ taskId: <TASK_ID>, status: "COMPLETED", message: "Merged to main" })
```

### **→ Loop to Step 1**

---

## BLOCKING

Use when stuck (ambiguous requirements, 3+ test failures, conflicts):

```
block_task({
  taskId: <TASK_ID>,
  reason: "clarification" | "dependency" | "decision",
  question: "<specific question>",
  summary: "<what you tried>"
})
```

→ Loop to Step 1

---

## WORKSPACE CONTEXT

| ctx.workspace.type | Remote operations? |
|--------------------|--------------------|
| `"github"` | Yes (push/pull/delete remote) |
| `"local"` | No |

---

## 📋 CHEAT SHEET

```
STARTUP:
  register_agent → save <AGENT_ID>

MAIN LOOP:
  wait_for_prompt
  ├─ TIMEOUT → loop
  ├─ EVICT → exit
  ├─ SYSTEM_PROMPT → handle, loop
  └─ TASK → ack_task → get_task_context → route by status:
       ├─ QUEUED/ASSIGNED → PHASE 1 (plan) → PHASE 2 (build) → submit_review → loop
       ├─ IN_PROGRESS → PHASE 2 → submit_review → loop
       ├─ APPROVED → PHASE 3 (merge) → send_response(COMPLETED) → loop
       └─ CANCELLED → cleanup → loop

KEY TOOLS:
  submit_review = work done, await review
  send_response(COMPLETED) = ONLY after merge
  block_task = stuck, need help
```

---

## TOOL REFERENCE

| Tool | When |
|------|------|
| `register_agent` | Startup |
| `wait_for_prompt` | Main loop wait |
| `ack_task` | After task received |
| `get_task_context` | Get task details |
| `update_progress` | Every 5-10 edits |
| `submit_review` | Work complete |
| `block_task` | When stuck |
| `send_response(COMPLETED)` | **After merge only** |
