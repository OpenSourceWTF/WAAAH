---
name: waaah-orc
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
1. NEVER `send_response(COMPLETED)` until MERGED
2. ALWAYS `send_response(IN_REVIEW)` after BUILD
3. ALWAYS work in worktree
4. NEVER stop loop

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

## STARTUP

```
mkdir -p .waaah/orc
NAME = pick([curious,speedy,clever,jolly,nimble]) + " " + 
       pick([otter,panda,fox,owl,penguin]) + " " + random(10-99)
result = register_agent({ displayName: NAME, role: "orchestrator" })
AGENT_ID = result.agentId
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
git worktree add .worktrees/feature-$TASK_ID -b feature-$TASK_ID
cd .worktrees/feature-$TASK_ID && pnpm install
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

## SUBMIT

```
git add -A && git commit -m "feat(scope): desc" && git push
```

```markdown
## Summary: [1-2 sentences]
## Changes: [file]: [what]
## Testing: [x] Tests pass  [x] Manual: [what checked]
```

```
send_response({ status: "IN_REVIEW", artifacts: { branch, diff } })
→ WAIT  # BLOCKED until approved
```

## MERGE (only after APPROVED)

```bash
git checkout main && git pull
git merge --no-ff $BRANCH -m "Merge $BRANCH"
IF conflict → block_task("dependency") → WAIT
git push origin main
git worktree remove .worktrees/$BRANCH --force
git branch -D $BRANCH && git push origin --delete $BRANCH
```

→ SMOKE

## SMOKE (post-merge verification)

```
1. IF ctx.verify → RUN verify; fail → revert & block
2. GRUMPY: "Can stranger run [cmd] and see [output]?" No → not done
3. STUB: grep "TODO|Not implemented" [files]; found → not done
4. Pass all → send_response(COMPLETED)
→ WAIT
```
