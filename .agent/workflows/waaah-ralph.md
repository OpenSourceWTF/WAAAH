---
name: waaah-ralph
description: Interactive task refinement with custom quality gates
---

# WAAAH Ralph

**Loop: Task + Criteria → Refine until 10/10.**

## Ralph Promise
- Ralph is a loop — iterate until perfect
- Faith in eventual consistency — each failure tunes the next run
- Signs next to the slide — explicit guardrails prevent repeated mistakes

## State Machine

```
INIT → COLLECT ──⏸️──→ PLAN ──⏸️──→ EXECUTE → SCORE ──⏸️──→ [LOOP | FINALIZE]
          ↑                                        ↓
          └────────────────────────────────────────┘

⏸️ = BLOCKED: Use notify_user, await user response before proceeding
```

**States:**
| State | Action | Gate |
|-------|--------|------|
| INIT | Check for incomplete sessions | — |
| COLLECT | Get task + criteria from user | ⏸️ User confirms |
| PLAN | Draft approach, show user | ⏸️ User approves |
| EXECUTE | Implement the task | — |
| SCORE | Rate against criteria, show user | ⏸️ User approves |
| LOOP | Refine lowest-scoring criterion | → EXECUTE |
| FINALIZE | Mark complete | ⏸️ User confirms |

## Rules

1. **Exit:** ALL criteria = 10
2. **Max:** 5 iterations
3. **Log:** `.waaah/ralph/NNN-slug/progress.md`
4. **Code tasks:** tests + types + lint must pass
5. **Conservative:** Never auto-proceed; always `notify_user` at gates

## Workflow

### 1. INIT
```
Check .waaah/ralph for incomplete sessions
If found: notify_user "Resume [folder]?" → await response
Else: proceed to COLLECT
```

### 2. COLLECT
```
notify_user "Task?" → await TASK
notify_user "Criteria? (default: clarity,completeness,correctness)" → await CRITERIA
TYPE = code | doc | optimize | spec | generic (based on keywords)
SLUG = first 4 words slugified
SESSION = .waaah/ralph/[NNN]-[SLUG]
mkdir -p SESSION
```
**⏸️ STOP:** `notify_user "Start? (y/n)"` → await confirmation

### 3. PLAN
```
Draft approach to complete TASK
Log plan to SESSION/progress.md
```
**⏸️ STOP:** `notify_user` with plan summary → await user approval before EXECUTE

### 4. EXECUTE
```
Implement the task
If TYPE=code: run pnpm typecheck && test && lint; fix failures
Log work to SESSION/progress.md
```

### 5. SCORE
```
Rate RESULT against each criterion (1-10)
Log scores to SESSION/progress.md
If TYPE=code: git commit -m "ralph: iter N - [SLUG]"
```
**⏸️ STOP:** `notify_user` with scores table → ask "Continue refining?" → await response

### 6. LOOP (if any score < 10, iterations < 5)
```
FOCUS = lowest-scoring criterion
Apply targeted strategy:
  - clarity → simplify, add examples
  - brevity → compress
  - correctness → fix errors
  - completeness → add missing cases
  - performance → benchmark and optimize
```
→ Go to EXECUTE

### 7. FINALIZE
```
Log "✅ COMPLETE" to SESSION/progress.md
```
**⏸️ STOP:** `notify_user` with final result + journey table → offer: "1. New task  2. Add criteria  3. Exit"

## Rubric

| Score | Meaning |
|-------|---------|
| 1-3 | Broken |
| 4-6 | Gaps |
| 7-8 | Minor issues |
| 9 | Nitpicks only |
| 10 | Perfect |
