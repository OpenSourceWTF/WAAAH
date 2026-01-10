---
name: waaah-ralph
description: Interactive task refinement with custom quality gates
---

# WAAAH Ralph

**Loop: Task + Criteria → Refine until 10/10 on all.**

---

## RULES

| # | Rule |
|---|------|
| 1 | Exit: ALL criteria = 10 |
| 2 | Max: 5 iterations |
| 3 | Log: `.waaah/ralph/progress.md` |
| 4 | Code: feedback must pass |

---

## TASK TYPES

| Type | Triggers | Actions |
|------|----------|---------|
| `code` | implement, function, refactor, test, fix, bug, API | tests + types + lint + git |
| `doc` | write, document, README, guide, article | — |
| `optimize` | optimize, compress, shorten, refine | → `/waaah-optimize` |
| `spec` | spec, requirements, feature, PRD | → `/waaah-spec` |
| `generic` | (default) | — |

---

## FLOW

```
INIT
  mkdir -p .waaah/ralph
  IF progress.md exists:
    PROMPT "Resume? (y/n)" → IF y: goto LOOP

COLLECT
  PROMPT "Task?" → TASK
  PROMPT "Criteria? (csv)" → CRITERIA[] | default: [clarity, completeness, correctness]
  TYPE = match(TASK, TASK_TYPES table)
  IF TYPE ∈ {optimize, spec}:
    PROMPT "Switch to /waaah-[TYPE]? (y/n)" → IF y: EXIT + follow
  DISPLAY "Task: [TASK] | Type: [TYPE] | Criteria: [CRITERIA]"
  PROMPT "Start? (y/n)" → IF n: EXIT

EXECUTE
  RESULT = do(TASK)
  IF TYPE=code:
    RUN: pnpm typecheck && pnpm test && pnpm lint
    IF fail: RESULT = fix errors first
  SCORES = rate(RESULT, each CRITERIA, 1-10)
  LOG(iteration=0, SCORES)
  IF TYPE=code: git commit -m "ralph: iter 0"

LOOP (i = 1..5)
  READ progress.md
  FOCUS = argmin(SCORES)
  
  # Improvement strategy by criterion
  IF FOCUS=clarity    → simplify language, add examples
  IF FOCUS=brevity    → remove redundancy, compress
  IF FOCUS=correctness → fix errors, verify facts
  IF FOCUS=completeness → add missing cases
  IF FOCUS=performance → optimize, benchmark
  
  RESULT = apply(strategy, RESULT)
  
  IF TYPE=code:
    RUN feedback
    IF fail: RESULT = fix errors; CONTINUE (don't advance)
  
  SCORES_NEW = rate(RESULT, each CRITERIA, 1-10)
  LOG(iteration=i, FOCUS, SCORES_NEW, delta)
  IF TYPE=code: git commit -m "ralph: iter [i] - [FOCUS]"
  
  IF all(SCORES_NEW) = 10: goto FINALIZE
  IF i = 5: WARN "Max iterations"; goto FINALIZE
  SCORES = SCORES_NEW

FINALIZE
  LOG "✅ COMPLETE"
  DISPLAY:
    [RESULT]
    | Iter | Focus | Δ |
    |------|-------|---|
    [journey from progress.md]
  PROMPT "1. New task  2. Add criteria  3. Exit"
```

---

## FEEDBACK (code only)

| Check | Command | Pass Required |
|-------|---------|---------------|
| Types | `pnpm typecheck` | ✓ |
| Tests | `pnpm test` | ✓ |
| Lint | `pnpm lint` | ✓ |

**On fail:** Fix errors before re-scoring. Do not advance iteration.

---

## RUBRIC

| Score | Meaning |
|-------|---------|
| 1-3 | Broken |
| 4-6 | Gaps |
| 7-8 | Minor issues |
| 9 | Nitpicks |
| 10 | Perfect |

---

## USAGE

```bash
gemini -p "Follow /waaah-ralph" .
```
