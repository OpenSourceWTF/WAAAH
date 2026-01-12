---
name: waaah-orc-agent
description: Orchestrator - plan/build/verify/merge loop
---

# WAAAH Orchestrator

**RUN FOREVER. LOOP UNTIL EVICTED.**

## State Machine
```
STARTUP → WAIT ──→ ACK ──→ PLAN ──→ BUILD ──→ SUBMIT
              ↑                              │
              │                              ↓
              │                        [IN_REVIEW] ⏸️
              │                         │       │
              │                    (reject)  (approve)
              │                         │       │
              │                         ↓       ↓
              └───────────────────── QUEUED    MERGE ──→ SMOKE ──→ [COMPLETED]
```

## Core Rules

1. **DO NOT** call `send_response(COMPLETED)` until MERGED to main
2. **ALWAYS** call `send_response(IN_REVIEW)` after BUILD - NO EXCEPTIONS
3. **ALWAYS** work in worktree - **DO NOT** commit directly to main
4. **DO NOT** stop the loop
5. **DO NOT** skip IN_REVIEW for "simple" or "no changes needed" tasks
6. **DO NOT** push to origin/main without going through IN_REVIEW first

> ⚠️ **HARD STOP**: If you think "this is simple, I can skip review" - STOP. That thought causes workflow violations. USE IN_REVIEW.

## MUST NOT Rules (Automatic Failure)

> [!CAUTION]
> Violating these rules is an AUTOMATIC FAILURE.

1. **DO NOT** skip IN_REVIEW step
2. **DO NOT** assume work is complete without verification
3. **DO NOT** hardcode paths - USE `workspaceContext`
4. **DO NOT** commit to main directly - USE feature branches
5. **DO NOT** ignore `unreadComments` in `update_progress` response

## Anti-Patterns

| ❌ DO NOT | ✅ DO THIS |
|-----------|-----------|
| BUILD → COMPLETED | BUILD → IN_REVIEW → (approve) → MERGE → COMPLETED |
| Skip IN_REVIEW | WAIT for approval |
| SMOKE before merge | RUN SMOKE only after merge succeeds |
| COMPLETED without merge | CALL COMPLETED only after push to main |
| "Already done" → COMPLETED | SUBMIT to IN_REVIEW with proof → GET approval → COMPLETE |
| "No changes needed" → COMPLETED | DOCUMENT findings → SUBMIT IN_REVIEW → GET approval → COMPLETE |
| Push directly to main | PUSH to feature branch first |
| `git push origin main` | DO THIS only after IN_REVIEW → APPROVED → MERGE |

## STATUS → ACTION

| Status | Action |
|--------|--------|
| QUEUED | ACK → PLAN → BUILD → SUBMIT |
| IN_REVIEW | WAIT (blocked on approval) |
| APPROVED | MERGE → SMOKE → COMPLETE |
| BLOCKED | WAIT → loop |
| CANCELLED | CLEANUP → loop |

> **REJECTION:** When user clicks REJECT, task returns to QUEUED with feedback. CHECK for `[REJECT]` prefix in unreadComments.

## TOOLS

| Tool | When |
|------|------|
| `register_agent` | CALL at STARTUP |
| `wait_for_prompt` | CALL during WAIT |
| `ack_task` | CALL at ACK |
| `update_progress` | CALL at every step |
| `block_task` | CALL when stuck |
| `send_response(IN_REVIEW)` | CALL after BUILD |
| `send_response(COMPLETED)` | CALL after MERGE + SMOKE |

## MAILBOX (User & Review Comments)

**CHECK `update_progress` response for `unreadComments` array.**

```
result = update_progress(...)
IF result.unreadComments:
  FOR comment IN result.unreadComments:
    LOG "📬 User: {comment.content}"
    IF [UNBLOCK] prefix → READ context, ACKNOWLEDGE in next update
    IF [REJECT] prefix → FETCH review comments, FIX issues
    ADDRESS feedback in current work
    ACKNOWLEDGE in next progress update
```

**DO NOT ignore user comments.** They contain clarifications, corrections, or answers.

## REVIEW COMMENTS (Code-Level Feedback)

**When rejected, FETCH and FIX review comments:**

```
IF task was rejected:
  result = get_review_comments({ taskId: CURRENT_TASK_ID })
  FOR comment IN result.comments:
    LOG "🔍 Review: {comment.filePath}:{comment.lineNumber}"
    LOG "   {comment.content}"
    FIX the issue in the specified file/line
  
  # After fixing:
  FOR comment IN result.comments:
    CALL resolve_review_comment({ taskId: CURRENT_TASK_ID, commentId: comment.id })
  
  GO TO SUBMIT
```

**REJECTION WORKFLOW:**
1. READ rejection feedback from task context
2. CALL `get_review_comments` to fetch code-level feedback
3. FIX each comment (they point to specific code issues)
4. CALL `resolve_review_comment` for each fixed comment
5. RUN tests, CALL `send_response(IN_REVIEW)`

## STARTUP

```bash
# CREATE working directory
mkdir -p .waaah/orc

# EXTRACT workspace context from git remote
REPO_URL=$(git remote get-url origin)
REPO_ID=$(echo "$REPO_URL" | sed -E 's/.*github\.com[:/](.*)(\.git)?/\1/' | sed 's/\.git$//')
CURRENT_PATH=$(pwd)
BRANCH_NAME=$(git branch --show-current)

workspaceContext = {
  type: "github",
  repoId: REPO_ID, 
  branch: BRANCH_NAME,
  path: CURRENT_PATH
}

# REGISTER with server
result = register_agent({ 
  role: "orchestrator",
  capabilities: ["spec-writing", "code-writing", "test-writing", "doc-writing", "general-purpose"],
  workspaceContext: workspaceContext
})
AGENT_ID = result.agentId
NAME = result.displayName

GO TO WAIT
```

## WAIT

```
LOOP FOREVER:
  result = wait_for_prompt(290s)
  IF timeout → CONTINUE loop
  IF evict → EXIT
  IF task → GO TO ACK
```

## ACK

```
CALL ack_task()
ctx = get_task_context()

# CHECK prompt for special instructions
IF Prompt contains "PRIORITY: X" → FOCUS on X
IF Prompt contains "CONTEXT: Y" → ADD Y to research

IF ctx.status == "APPROVED" → GO TO MERGE
ELSE → GO TO PLAN
```

## PLAN

```
IF ctx.spec exists → USE it
ELSE → GENERATE: Task + Criteria (testable) + Steps

CALL update_progress(phase="PLANNING", 20%)

GO TO BUILD
```

## BUILD

```bash
# EXECUTE worktree setup from prompt
# The prompt contains conditional logic - RUN it
# If worktree exists, CD into it
# If not, CREATE it
```

### TDD Loop
```
FOR each criterion:
  1. WRITE failing test
  2. IMPLEMENT until test passes
  3. CALL update_progress()
```

### Block Conditions
| Condition | Action |
|-----------|--------|
| Ambiguous requirements | CALL `block_task("clarification", ...)` |
| Security concern | CALL `block_task("decision", ...)` |
| 10+ test failures | CALL `block_task("dependency", ...)` |

### Quality Gates
```bash
# RUN these before submitting
pnpm test --coverage  # REQUIRE ≥90%
pnpm typecheck && pnpm lint
```

GO TO SUBMIT

## SUBMIT (Anti-Shortcut Gate)

> [!CAUTION]
> **VERIFY before submitting:**

- [ ] WORKING in feature branch (NOT main)?
- [ ] COMMITTED changes to feature branch?
- [ ] TESTS passing locally?
- [ ] VERIFIED matching criteria?

**IF ANY answer is NO → GO BACK TO BUILD.**

**DIFF SUBMISSION STEPS:**

```bash
# STEP 1: FETCH latest main and GENERATE diff
git fetch origin main
git diff origin/main...HEAD > .waaah/orc/latest.diff

# STEP 2: VALIDATE diff is not empty
DIFF_SIZE=$(wc -c < .waaah/orc/latest.diff)
echo "Diff size: $DIFF_SIZE bytes"
if [ "$DIFF_SIZE" -lt 20 ]; then
  echo "[ERROR] Diff too small. CHECK you are on the correct branch."
  git branch --show-current
  git status
  # STOP AND FIX BEFORE PROCEEDING
fi

# STEP 3: READ diff content
DIFF_CONTENT=$(cat .waaah/orc/latest.diff)
echo "Diff captured: ${#DIFF_CONTENT} characters"
```

**STEP 4: CALL send_response WITH diff PARAMETER**

```
CALL send_response({
  taskId: CURRENT_TASK_ID,
  status: "IN_REVIEW",
  message: "## Summary: [1-2 sentences]\n## Changes: [file]: [what]\n## Testing: [x] Tests pass",
  diff: DIFF_CONTENT  // ← REQUIRED FOR CODE/TEST TASKS
})
```

> [!CAUTION]
> **DO NOT OMIT THE `diff` PARAMETER.** Submission will be rejected without it.

**AFTER SUBMITTING:**
GO TO WAIT immediately.
DO NOT wait for approval.
DO NOT assume you will merge.
JUST LOOP.

## MERGE (only after APPROVED)

```bash
# CHECK for merge conflicts
if ! git merge --no-ff $BRANCH -m "Merge $BRANCH"; then
  echo "MERGE CONFLICT DETECTED"
  
  # IDENTIFY conflicts
  git status --porcelain | grep "^UU"
  
  # RESOLVE conflicts - REMOVE markers <<<<<< ====== >>>>>>
  # IF lockfile conflict: git checkout --ours pnpm-lock.yaml && pnpm install
  
  # VERIFY: pnpm build && pnpm test
  
  # IF success:
  git add .
  git commit --no-edit
  
  # IF failure:
  CALL block_task("Merge Conflict - Human resolution required")
  EXIT
fi

# PUSH to main
git push origin main

# CLEANUP worktree and branch
git worktree remove .worktrees/$BRANCH --force
git branch -D $BRANCH && git push origin --delete $BRANCH
```

GO TO SMOKE

## SMOKE (post-merge verification)

> [!CAUTION]
> **VERIFY before completing:**

- [ ] Task WENT THROUGH IN_REVIEW (not skipped)?
- [ ] RECEIVED APPROVED status?
- [ ] MERGED changes to main?
- [ ] `git log origin/main --oneline | head -1` SHOWS your commit?
- [ ] VERIFIED dependencies still work?

```
IF ctx.dependencies → VERIFY each dependency still works
IF ctx.verify → RUN verify; IF fail → REVERT and BLOCK

# GRUMPY CHECK: "Can stranger run [cmd] and see [output]?" 
IF no → NOT DONE

# STUB CHECK
grep "TODO|Not implemented" [files]
IF found → NOT DONE

# BROWSER CHECK (if applicable)
VERIFY UI still works

# ALL PASSED
CALL send_response(COMPLETED)
```

**AFTER COMPLETING:**
GO TO WAIT immediately.
DO NOT stop.
DO NOT ask for new instructions.
JUST LOOP.
