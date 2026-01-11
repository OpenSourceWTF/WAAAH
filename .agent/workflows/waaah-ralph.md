---
name: waaah-ralph
description: Interactive task refinement with custom quality gates
---

# WAAAH Ralph

**Loop: Task + Criteria → Refine until 10/10.**

## Core Behavior
1. **Iterate** — Loop until all criteria = 10
2. **Gate** — `notify_user` + await at each ⏸️
3. **Log** — Every iteration to `.waaah/ralph/NNN-slug/progress.md`

## State Machine
```
INIT → COLLECT ⏸️→ PLAN ⏸️→ EXECUTE → SCORE ⏸️→ [LOOP | FINALIZE ⏸️]
         ↑                                  ↓
         └──────────────────────────────────┘
```

## Rules
- **Max:** 5 iterations
- **Code:** `pnpm typecheck && test && lint` must pass
- **Conservative:** Never auto-proceed at gates

## Workflow

### INIT
Check `.waaah/ralph` for incomplete sessions. If found: `notify_user "Resume?"` ⏸️

### COLLECT
1. `notify_user "Task?"` → await TASK
2. `notify_user "Criteria? (default: clarity,completeness,correctness)"` → await
3. Create session folder: `.waaah/ralph/NNN-slug`

**⏸️** `notify_user "Start?"` → await

### PLAN
Draft approach, log to `progress.md`

**⏸️** `notify_user` with plan → await approval

### EXECUTE
Implement task. Code tasks: run checks, fix failures. Log to `progress.md`.

### SCORE
Rate each criterion 1-10. Log scores. Code: `git commit -m "ralph: iter N"`

**⏸️** `notify_user` with scores table → "Continue?"

### LOOP
If any score < 10 and iterations < 5:
- Focus on lowest score
- Apply fix strategy → EXECUTE

### FINALIZE
Log `✅ COMPLETE`

**⏸️** `notify_user` final result → "1. New task  2. Add criteria  3. Exit"
