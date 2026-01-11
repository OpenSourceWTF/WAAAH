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

## Default Criteria

| Criterion | Definition |
|-----------|------------|
| clarity | Zero ambiguity |
| completeness | All cases covered |
| correctness | No bugs/errors |

## Workflow

### INIT
Check `.waaah/ralph` for incomplete sessions. If found: `notify_user "Resume?"` ⏸️

### COLLECT
1. `notify_user "Task?"` → await TASK
2. `notify_user "Criteria?"` → await (or use defaults)
3. Create session: `.waaah/ralph/NNN-slug`

**⏸️** `notify_user "Start?"` → await

### PLAN
Draft approach, log to `progress.md`

**⏸️** `notify_user` with plan → await approval

### EXECUTE
Implement task. Code: run checks, fix failures. Log to `progress.md`.

### SCORE
Rate each criterion 1-10. Log scores.

**⏸️** `notify_user` with scores → "Continue?"

### LOOP
Focus on lowest score. Apply strategy:

| Score Type | Strategy |
|------------|----------|
| clarity | Simplify, add examples |
| completeness | Add missing cases |
| correctness | Fix errors |
| performance | Benchmark |
| brevity | Compress |

→ Return to EXECUTE

### FINALIZE
Log `✅ COMPLETE`. Code: `git commit -m "ralph: complete - [SLUG]"`

**⏸️** `notify_user` final result → "1. New task  2. Add criteria  3. Exit"

## Compression Patterns (from /waaah-optimize)

| Verbose | Compressed |
|---------|------------|
| "You should consider..." | DO: |
| "It's important to..." | (delete) |
| Paragraph | Table/bullet |
| Conditional prose | `IF X → Y` |
