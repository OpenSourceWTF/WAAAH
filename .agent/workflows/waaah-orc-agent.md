---
name: waaah-orc-agent
description: Orchestrator - plan/build/verify/merge loop
---

# WAAAH Orchestrator

**Autonomous agent. Infinite loop until evicted.**

## State Machine
```
STARTUP → WAIT ──→ ACK ──→ PLAN ──→ BUILD ──→ SUBMIT
              ↑                              │
              │                              ↓
              │                        [IN_REVIEW] ⏸️
              │                              │
              │                         (approve)
              │                              ↓
              └────────────────────── MERGE ──→ SMOKE ──→ [COMPLETED]
```

## Core Rules
1. NEVER `send_response(COMPLETED)` until MERGED to main
2. ALWAYS `send_response(IN_REVIEW)` after BUILD - NO EXCEPTIONS
3. ALWAYS work in worktree (NEVER commit directly to main)
4. NEVER stop loop
5. **NEVER skip IN_REVIEW even for "simple" or "no changes needed" tasks**
6. **NEVER push to origin/main without going through IN_REVIEW first**

> ⚠️ **HARD STOP**: If you find yourself thinking "this is simple, I can skip review" - STOP. That thought is the #1 cause of workflow violations. ALWAYS use IN_REVIEW.

## MUST NOT Rules (Systematic Failure)

> [!CAUTION]
> Violating these rules is an AUTOMATIC FAILURE.

1. **MUST NOT** skip IN_REVIEW step (Anti-Shortcut Rule #1)
2. **MUST NOT** assume work is complete without verification
3. **MUST NOT** hardcode paths (use `workspaceContext`)
4. **MUST NOT** commit to main directly (use feature branches)
5. **MUST NOT** ignore "unreadComments" in `update_progress`

## Anti-Patterns (NEVER DO)

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| BUILD → COMPLETED | BUILD → IN_REVIEW → (approve) → MERGE → COMPLETED |
| Skip IN_REVIEW | Always wait for approval |
| SMOKE before merge | SMOKE only after merge succeeds |
| COMPLETED without merge | COMPLETED only after push to main |
| "Already done" → COMPLETED | "Already done" → IN_REVIEW with proof → approval → COMPLETED |
| "No changes needed" → COMPLETED | Document findings → IN_REVIEW → approval → COMPLETED |
| Push directly to main | ALWAYS push to feature branch first |
| `git push origin main` | Only after IN_REVIEW → APPROVED → MERGE |

## STATUS → ACTION

| Status | Action |
|--------|--------|
| QUEUED | ACK → PLAN → BUILD → SUBMIT |
| IN_REVIEW | WAIT (blocked on approval) |
| APPROVED | MERGE → SMOKE → COMPLETE |
| BLOCKED | WAIT → loop |
| CANCELLED | cleanup → loop |

## TOOLS

| Tool | When |
|------|------|
| `register_agent` | STARTUP |
| `wait_for_prompt` | WAIT |
| `ack_task` | ACK |
| `update_progress` | Every step |
| `block_task` | When stuck |
| `send_response(IN_REVIEW)` | After BUILD |
| `send_response(COMPLETED)` | After MERGE + SMOKE |

## MAILBOX (User Comments)

**CRITICAL:** Check `update_progress` response for `unreadComments` array.

```
result = update_progress(...)
IF result.unreadComments:
  FOR comment IN result.unreadComments:
    - Log: "📬 User: {comment.content}"
    - IF [UNBLOCK] prefix → task was just unblocked, acknowledge context
    - Address or incorporate feedback into current work
    - Acknowledge in next progress update
```

**Never ignore user comments.** They may contain clarifications, corrections, or answers to blocked questions.

## STARTUP

```
mkdir -p .waaah/orc

# MANDATORY: Infer workspace context dynamically
# CAUTION: Do not hardcode repoId. Use git remote.
REPO_URL=$(git remote get-url origin)
# Extract "Owner/Repo" (e.g. OpenSourceWTF/WAAAH)
REPO_ID=$(echo "$REPO_URL" | sed -E 's/.*github\.com[:/](.*)(\.git)?/\1/' | sed 's/\.git$//')
CURRENT_PATH=$(pwd)
BRANCH_NAME=$(git branch --show-current)

workspaceContext = {
  type: "github",
  repoId: REPO_ID, 
  branch: BRANCH_NAME,
  path: CURRENT_PATH
}

result = register_agent({ 
  role: "orchestrator",
  capabilities: ["spec-writing", "code-writing", "test-writing", "doc-writing", "general-purpose"],
  workspaceContext: workspaceContext
})
AGENT_ID = result.agentId
NAME = result.displayName  # Server auto-generates adjective-noun-NN format
→ WAIT
```

## WAIT

```
FOREVER:
  result = wait_for_prompt(290s)
  IF timeout → continue
  IF evict → exit
  IF task → ACK
```

## ACK

```
ack_task()
ctx = get_task_context()

# ANALYZE PROMPT FOR INSTRUCTIONS
# The server/user may send specific constraints or override instructions.
# IF Prompt says "PRIORITY: X" -> Focus on X.
# IF Prompt says "CONTEXT: Y" -> Add Y to specific research.

IF ctx.status == "APPROVED" → MERGE
ELSE → PLAN
```

## PLAN

```
IF ctx.spec → use it
ELSE → generate: Task + Criteria (testable) + Steps
update_progress(phase="PLANNING", 20%)
→ BUILD
```

## BUILD

```bash
# S18: WORKTREE SETUP (Resume-Aware)
# The prompt will contain setup instructions. Execute them.
# If worktree already exists, you will cd into it.
# If it doesn't exist, it will be created.
# IMPORTANT: The server sends conditional logic, just run it.
```

### TDD Loop
```
FOR criterion: 1. Write failing test  2. Implement → pass  3. update_progress()
```

### Block Conditions
| Condition | Reason |
|-----------|--------|
| Ambiguous | `clarification` |
| Security | `decision` |
| 10+ failures | `dependency` |

### Quality Gates
```
pnpm test --coverage  # ≥90%
pnpm typecheck && pnpm lint
```

→ SUBMIT

## SUBMIT (Anti-Shortcut Gate)

> [!CAUTION]
> **PRE_SUBMIT CHECKLIST (MANDATORY)**

- [ ] Working in feature branch (NOT main)?
- [ ] Changes committed to feature branch?
- [ ] Tests passing locally?
- [ ] Did I verify matching criteria?

If ANY answer is NO → Go back to BUILD.

**MANDATORY DIFF SUBMISSION STEPS:**

```bash
# STEP 1: Fetch latest main and generate diff
git fetch origin main
git diff origin/main...HEAD > .waaah/orc/latest.diff

# STEP 2: Validate diff is not empty
DIFF_SIZE=$(wc -c < .waaah/orc/latest.diff)
echo "Diff size: $DIFF_SIZE bytes"
if [ "$DIFF_SIZE" -lt 20 ]; then
  echo "[ERROR] Diff too small. Are you on the correct branch?"
  git branch --show-current
  git status
  # STOP AND FIX BEFORE PROCEEDING
fi

# STEP 3: Read diff content for send_response
DIFF_CONTENT=$(cat .waaah/orc/latest.diff)
echo "Diff captured: ${#DIFF_CONTENT} characters"
```

**STEP 4: CALL send_response WITH THE diff PARAMETER (MANDATORY)**

You MUST call `send_response` with FOUR arguments. The `diff` parameter is REQUIRED:

```
send_response({
  taskId: CURRENT_TASK_ID,
  status: "IN_REVIEW",
  message: "## Summary: [1-2 sentences]\n## Changes: [file]: [what]\n## Testing: [x] Tests pass",
  diff: DIFF_CONTENT  // ← THIS IS MANDATORY! Pass the output of `git diff origin/main...HEAD`
})
```

> [!CAUTION]
> **DO NOT OMIT THE `diff` PARAMETER.** If you call send_response without `diff`, your submission will be rejected.

> **LOOP INSTRUCTION**:
> You have successfully submitted the task for review.
> **GO TO STEP 1.1 (WAIT)** immediately.
> Do NOT wait for approval. Do NOT assume you will be the one to merge.
> JUST LOOP.


## MERGE (only after APPROVED)

```bash
# CRITICAL: Check for merge conflicts
if ! git merge --no-ff $BRANCH -m "Merge $BRANCH"; then
  echo "MERGE CONFLICT DETECTED - ATTEMPTING RESOLUTION"
  
  # 1. Identify conflicts: `git status --porcelain | grep "^UU"`
  # 2. RESOLVE: Edit files to remove markers <<<<<< ====== >>>>>>
  #    - If lockfile conflict: `git checkout --ours pnpm-lock.yaml && pnpm install`
  # 3. VERIFY: `pnpm build && pnpm test`
  # 4. IF SUCCESS:
  #    git add .
  #    git commit --no-edit
  # 5. IF FAILURE (Tests fail or too complex):
  #    block_task("Merge Conflict - Human resolution required")
  #    exit 1
fi
git push origin main
git worktree remove .worktrees/$BRANCH --force
git branch -D $BRANCH && git push origin --delete $BRANCH
```

→ SMOKE

## SMOKE (post-merge verification)

> [!CAUTION]
> **PRE_COMPLETE CHECKLIST (MANDATORY)**

- [ ] Task went through IN_REVIEW (not skipped)?
- [ ] Received APPROVED status?
- [ ] Changes merged to main?
- [ ] `git log origin/main --oneline | head -1` shows your commit?
- [ ] Did you verify dependencies still work?

```
0. IF ctx.dependencies → verify EACH dependency still works
1. IF ctx.verify → RUN verify; fail → revert & block
2. GRUMPY: "Can stranger run [cmd] and see [output]?" No → not done
3. STUB: grep "TODO|Not implemented" [files]; found → not done
4. BROWSER: does the UI still work? (if applicable)
5. Pass all → send_response(COMPLETED)
```

> **LOOP INSTRUCTION**:
> You have completed the task.
> **GO TO STEP 1.1 (WAIT)** immediately.
> Do NOT stop. Do NOT ask for new instructions.
> JUST LOOP.

