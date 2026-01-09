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

## ⚡ APPROVED DETECTION (CHECK FIRST!)

**Before doing ANY work on a returning task, check if it's approved:**

```bash
# Does the worktree already exist?
git worktree list | grep "feature-<TASK_ID>"
```

| Worktree Exists? | ctx.messages | Meaning | Action |
|------------------|--------------|---------|--------|
| ❌ No | — | Fresh task | PHASE 1 → PHASE 2 |
| ✅ Yes | Empty `[]` | **APPROVED** | → PHASE 3 (Merge) |
| ✅ Yes | Has content | Rejected | → Read feedback, PHASE 2 |

> **⚠️ If worktree exists + empty messages = APPROVED. Merge immediately!**

---

## STATUS ROUTING

**⚠️ CRITICAL: APPROVED Detection**

The system may return tasks with `status: "ASSIGNED"` even when approved. You MUST check these conditions:

```
IS_APPROVED = (
  ctx.status === "APPROVED"                           // Explicit approval
  OR (worktree_exists(BRANCH) AND ctx.messages empty) // Re-assigned after review
  OR ctx.wasApproved === true                         // Explicit flag if available
)
```

**Worktree Existence Check:**
```bash
# Check if feature branch worktree exists
git worktree list | grep "feature-<TASK_ID>"
```
- If worktree EXISTS and task is re-assigned → Likely APPROVED → PHASE 3
- If worktree DOES NOT exist → Fresh task → PHASE 1/2

| Task Status | Additional Check | Your Action |
|-------------|------------------|-------------|
| QUEUED / ASSIGNED (no worktree) | Fresh task | → PHASE 1 (Plan) |
| QUEUED / ASSIGNED (worktree exists, no feedback) | **APPROVED** | → PHASE 3 (Merge) |
| QUEUED / ASSIGNED (worktree exists, has feedback) | Rejected | → Read feedback, PHASE 2 |
| IN_PROGRESS (new) | | → PHASE 2 (Build) |
| APPROVED | | → PHASE 3 (Merge) |
| BLOCKED + answer | | → Resume PHASE 2 with answer |
| CANCELLED | | → Cleanup worktree, loop |
| IN_REVIEW | | → Do nothing, wait |

> **Note**: Tasks returning from `IN_REVIEW` with feedback become `QUEUED` again. Check `task.messages` for user comments. Empty `messages` array with existing worktree = APPROVED.

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

### Step 4: ROUTE (CRITICAL - Detect APPROVED)

**Before routing, check for worktree existence:**

```bash
WORKTREE_EXISTS=$(git worktree list | grep -c "feature-<TASK_ID>" || echo "0")
```

**Decision Tree:**

```
IF ctx.status === "APPROVED" OR ctx.status === "approved":
  → PHASE 3 (Merge)

ELSE IF ctx.status === "CANCELLED":
  → Cleanup worktree, loop

ELSE IF ctx.status === "IN_REVIEW":
  → Do nothing, wait (loop back to Step 1)

ELSE IF WORKTREE_EXISTS > 0:
  # This is a returning task - was it approved or rejected?
  IF ctx.messages is empty OR ctx.messages.length === 0:
    # No feedback = APPROVED!
    → PHASE 3 (Merge)
  ELSE:
    # Has feedback = Rejected, needs revision
    → Read messages, PHASE 2 (Build - resume)

ELSE:
  # Fresh task - no worktree exists
  → PHASE 1 (Plan) → PHASE 2 (Build)
```

> **⚠️ KEY INSIGHT**: If you previously submitted a task for review, and it comes back with an empty messages array, it was APPROVED. Do not restart work - proceed to merge!

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

### 2.3 Build Loop (with Heartbeat per S19)

```
FOR each acceptance criterion:
  1. Write/update test
  2. Run tests → Should fail
  3. Implement code
  4. Run tests → Should pass
  
  HEARTBEAT (Required per S19):
  - Every 2-3 minutes OR after each criterion completion
  - Call update_progress with meaningful summary
```

**Progress Update Format:**
```
update_progress({
  taskId: <TASK_ID>,
  agentId: <AGENT_ID>,
  phase: "EXECUTION",
  message: "Completed auth middleware, starting login route tests",
  percentage: 45,
  challenges: ["Had to refactor session handling for JWT support"]
})
```

> **⚠️ CRITICAL**: Regular heartbeats prove agent is active. Stale tasks (>5 min without update) appear stuck on Dashboard.

### 2.4 Test Loop (REQUIRED)

**After completing Build Loop, run comprehensive test verification:**

```
TEST_LOOP:
  1. Run full test suite: pnpm test
  2. IF tests fail:
     a. Analyze failure output
     b. Fix the issue
     c. GOTO TEST_LOOP (re-run all tests)
  3. IF tests pass:
     a. Run type check: pnpm typecheck OR tsc --noEmit
     b. IF type errors → Fix and GOTO TEST_LOOP
  4. Run lint: pnpm lint
     a. IF lint errors → Fix and GOTO TEST_LOOP
  5. ALL CHECKS PASS → Continue to Quality Gate
```

**Test Loop Heartbeat:**
```
update_progress({
  taskId: <TASK_ID>,
  agentId: <AGENT_ID>,
  phase: "TESTING",
  message: "All tests passing (15/15), type check clean",
  percentage: 80
})
```

> **⚠️ Do NOT proceed to Quality Gate until ALL tests, type checks, and lint pass.**

### 2.5 Quality Gate

Rate 1-10: Correctness? Code quality?
**Both ≥9.5 → Continue. Otherwise → Fix.**

### 2.6 Documentation Phase (per S17)

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

### 2.7 **Submit for Review** (KEY STEP)

1. **Generate Diffs**:
   ```bash
   # Create diffs.json structure
   echo '{ "files": [] }' > diffs.json
   
   # For each changed file, append to json (agent implementation detail)
   # Ideally:
   # 1. git diff --name-only origin/main > changed_files.txt
   # 2. Iterate and read 'git diff origin/main -- <file>'
   # 3. Construct JSON: { "path": "...", "diff": "..." }
   ```
   **Requirement**: You MUST generate a JSON file containing the diffs of all changed files.

2. **Send Response**:
   ```
   send_response({
     taskId: <TASK_ID>,
     status: "IN_REVIEW", 
     message: "feat: <brief description>",
     artifacts: ["<WORKTREE>/diffs.json"]
   })
   ```

- **Success** → Status becomes IN_REVIEW → Loop to Step 1
- **Failure** (tests fail) → Fix issues, retry

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
  └─ TASK → ack_task → get_task_context → CHECK WORKTREE:
  
       ⚡ WORKTREE CHECK (CRITICAL):
       git worktree list | grep "feature-<TASK_ID>"
       ├─ Worktree EXISTS + empty messages → APPROVED → PHASE 3 (merge)
       ├─ Worktree EXISTS + has messages  → Rejected → PHASE 2 (fix)
       └─ Worktree MISSING               → Fresh    → PHASE 1 → PHASE 2

       Route by check result:
       ├─ Fresh task → PHASE 1 (plan) → PHASE 2 (build) → send_response(IN_REVIEW) → loop
       ├─ APPROVED → PHASE 3 (merge) → send_response(COMPLETED) → loop
       └─ CANCELLED → cleanup → loop

KEY TOOLS:
  send_response(IN_REVIEW) = work done, await review
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
| `send_response(IN_REVIEW)` | Work complete, request review |
| `block_task` | When stuck |
| `send_response(COMPLETED)` | **After merge only** |
