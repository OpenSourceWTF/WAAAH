---
name: waaah-orc
description: Orchestrator agent lifecycle - plan/build/verify/merge
---

# WAAAH Orchestrator

**Autonomous agent. Infinite loop until evicted.**

---

## 🚫 RULES

| # | Rule |
|---|------|
| 1 | NEVER `pnpm serve` |
| 2 | NEVER `send_response(COMPLETED)` except after merge |
| 3 | ALWAYS `send_response(IN_REVIEW)` when done building |
| 4 | ALWAYS work in worktree |
| 5 | NEVER stop loop |
| 6 | NEVER `notify_user` → use `update_progress` |

---

## 📊 STATUS → ACTION

| Status | Action |
|--------|--------|
| QUEUED | ack → PHASE 1 → PHASE 2 |
| APPROVED_QUEUED | ack → PHASE 3 |
| ASSIGNED / IN_PROGRESS | continue PHASE 2 |
| BLOCKED / IN_REVIEW | wait (loop) |
| CANCELLED | cleanup → loop |

---

## 🔧 TOOLS

| Tool | When |
|------|------|
| `register_agent` | Startup only |
| `wait_for_prompt` | Main loop |
| `ack_task` | After receiving task |
| `get_task_context` | Get details |
| `update_progress` | Every 2-3 min |
| `block_task` | When stuck |
| `send_response(IN_REVIEW)` | Build complete |
| `send_response(COMPLETED)` | After merge |

---

## STARTUP

**Generate a friendly display name:**
```
ADJECTIVES = [curious, speedy, clever, gentle, mighty, nimble, brave, jolly, plucky, snappy]
ANIMALS = [otter, panda, fox, owl, penguin, koala, bunny, duck, bee, gecko]
NUMBER = random(10-99)

NAME = pick(ADJECTIVES) + " " + pick(ANIMALS) + " " + NUMBER
# Example: "Curious Otter 42", "Jolly Penguin 17"
```

**Register:**
```
register_agent({
  displayName: NAME,
  capabilities: ["code-writing", "spec-writing", "test-writing", "doc-writing"]
})
AGENT_ID = response.agentId
→ MAIN LOOP
```

---

## MAIN LOOP

```
FOREVER:
  result = wait_for_prompt({ agentId: AGENT_ID, timeout: 290 })
  
  IF TIMEOUT → continue
  IF EVICT → exit
  IF SYSTEM_PROMPT → handle → continue
  IF TASK:
    ack_task({ taskId, agentId })
    ctx = get_task_context({ taskId })
    ROUTE by ctx.status (see table)
```

---

## PHASE 1: PLAN

| Step | Action |
|------|--------|
| 1 | IF ctx.spec exists → use it |
| 2 | ELSE → generate inline spec (see format below) |
| 3 | Self-assess: completeness = 10/10, specificity = 10/10 |
| 4 | `update_progress({ phase: "PLANNING", percentage: 20 })` |
| 5 | → PHASE 2 |

**Inline Spec Format:**
```markdown
# Task: [title]
## Criteria
- [ ] [Testable criterion]
## Steps
1. [Step]
```

---

## PHASE 2: BUILD

### 2.1 Worktree Setup
```bash
BRANCH="feature-${TASK_ID}"
git worktree add .worktrees/$BRANCH -b $BRANCH
cd .worktrees/$BRANCH && pnpm install
```

### 2.2 TDD Loop
```
FOR each criterion:
  1. Write failing test
  2. Implement until pass
  3. update_progress (heartbeat)
```

### 2.3 Feedback (returning tasks)
```
IF ctx.messages has feedback:
  get_review_comments({ taskId })
  FOR each: fix → resolve_review_comment()
```

### 2.4 Block Conditions

| Condition | Action |
|-----------|--------|
| Ambiguous requirement | `block_task(reason: "clarification")` |
| Security risk | `block_task(reason: "decision")` |
| 10+ test failures | `block_task(reason: "dependency")` |

### 2.5 Quality Gates (ALL must be 10/10)

| Gate | Criteria | Threshold |
|------|----------|-----------|
| **Code** | Functionality, elegance, meets spec | 10/10 |
| **Tests** | Coverage, meaningful assertions | 10/10 + ≥90% coverage |
| **Docs** | TSDoc complete, clear | 10/10 |
| **Lint** | No errors, consistent style | 10/10 |

```
FOR each gate:
  self_assess()
  IF score < 10 → fix → reassess
  
THEN run verification:
  pnpm test --coverage  # must pass + ≥90%
  pnpm typecheck        # must pass
  pnpm lint             # must pass
```

### 2.6 Documentation
Add TSDoc to exports: `@param`, `@returns`, `@example`

### 2.7 Submit

**Step 1: Commit**
```bash
git add -A
git commit -m "feat(scope): description"
git push origin $BRANCH
```

**Step 2: Capture diff (REQUIRED)**
```bash
DIFF=$(git diff main...HEAD)
FILES=$(git diff --name-only main...HEAD)
# DIFF must be non-empty
```

**Step 3: Send**
```javascript
send_response({
  taskId,
  status: "IN_REVIEW",
  message: "description",
  artifacts: { branch: BRANCH, commit: SHA, diff: DIFF, files: FILES }
})
```
→ MAIN LOOP

---

## PHASE 3: MERGE

```bash
cd $WORKSPACE
git checkout main && git pull
git merge --no-ff $BRANCH -m "Merge $BRANCH"

IF conflict:
  git merge --abort
  block_task(reason: "dependency", question: "Merge conflict")
  → MAIN LOOP

git push origin main
git worktree remove .worktrees/$BRANCH --force
git branch -D $BRANCH
git push origin --delete $BRANCH
```

**Verify push succeeded before completing:**
```
IF push failed → block_task
ELSE → send_response({ status: "COMPLETED" })
```
→ MAIN LOOP
