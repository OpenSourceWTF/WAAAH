---
name: waaah-ralph
description: Interactive task refinement with custom quality gates
---

# WAAAH Ralph

**Task + Criteria → Loop until 10/10.**

## Core Rules
1. `notify_user` + await at every ⏸️
2. Log every iteration to `.waaah/ralph/NNN-slug/progress.md`
3. Max 5 iterations
4. Code tasks: `pnpm typecheck && test && lint` must pass

## State Machine
```
INIT → COLLECT ⏸️→ PLAN ⏸️→ EXECUTE → SCORE ⏸️→ [LOOP | FINALIZE ⏸️]
         ↑                                  ↓
         └──────────────────────────────────┘
```

## Default Criteria

| Criterion | Definition |
|-----------|------------|
| clarity | Zero ambiguity |
| completeness | All cases covered |
| correctness | No bugs/errors |

## Workflow

### INIT
Check `.waaah/ralph` for incomplete sessions.
If found: ⏸️ `notify_user "Resume [folder]?"` → await

### COLLECT
1. ⏸️ `notify_user "Task?"` → await
2. ⏸️ `notify_user "Criteria? (default: clarity, completeness, correctness)"` → await
3. Create `.waaah/ralph/NNN-slug`
4. ⏸️ `notify_user "Start?"` → await

### PLAN
Draft approach. Log to `progress.md`.
⏸️ `notify_user` plan summary → await approval

### EXECUTE
Implement. Code: run checks, fix failures. Log to `progress.md`.

### SCORE
Rate each criterion 1-10. Log scores. Code: `git commit`.
⏸️ `notify_user` scores table → "Continue refining?"

### LOOP (if any < 10 AND iter < 5)
Focus lowest score:

| Criterion | Strategy |
|-----------|----------|
| clarity | Simplify |
| completeness | Add cases |
| correctness | Fix bugs |

→ EXECUTE

### FINALIZE
Log `✅ COMPLETE`. Code: `git commit -m "ralph: complete"`.
⏸️ `notify_user` result → "1. New task  2. Add criteria  3. Exit"
