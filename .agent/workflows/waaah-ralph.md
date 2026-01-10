---
name: waaah-ralph
description: Interactive task refinement with custom quality gates
---

# WAAAH Ralph

**Loop: Task + Criteria → Refine until 10/10.**

## RULES

| # | Rule |
|---|------|
| 1 | Exit: ALL criteria = 10 |
| 2 | Max: 5 iterations |
| 3 | Log: `.waaah/ralph/NNN-slug/progress.md` |
| 4 | Code: tests+types+lint must pass |

## TASK TYPES

| Type | Triggers | Actions |
|------|----------|---------|
| `code` | implement, refactor, fix, test, API | tests + git |
| `doc` | write, document, README | — |
| `optimize` | optimize, compress, refine | → `/waaah-optimize` |
| `spec` | spec, requirements, PRD | → `/waaah-spec` |
| `generic` | (default) | — |

## INIT

```
mkdir -p .waaah/ralph
NEXT = (ls .waaah/ralph | grep -E "^[0-9]{3}-" | wc -l) + 1

# Check incomplete sessions
FOR folder in .waaah/ralph/*:
  IF progress.md exists AND NOT "✅ COMPLETE":
    PROMPT "Resume [folder]? (y/n)" → y: SESSION=folder; goto LOOP
```

## COLLECT

```
PROMPT "Task?" → TASK
PROMPT "Criteria? (csv)" → CRITERIA | default: [clarity,completeness,correctness]
TYPE = match(TASK, triggers)

IF TYPE ∈ {optimize,spec}:
  PROMPT "Switch to /waaah-[TYPE]? y/n" → y: EXIT

SLUG = slugify(first 4 words)
SESSION = .waaah/ralph/[printf "%03d" NEXT]-[SLUG]
mkdir -p SESSION
PROMPT "Start? (y/n)" → n: EXIT
```

## EXECUTE

```
RESULT = do(TASK)
IF TYPE=code: RUN pnpm typecheck && test && lint; fail → fix
SCORES = rate(RESULT, CRITERIA, 1-10)
LOG(SESSION/progress.md, iter=0, SCORES)
IF TYPE=code: git commit -m "ralph: iter 0 - [SLUG]"
```

## LOOP (i=1..5)

```
FOCUS = argmin(SCORES)
STRATEGY = {
  clarity → simplify, add examples
  brevity → compress
  correctness → fix errors
  completeness → add cases
  performance → benchmark
}
RESULT = apply(STRATEGY[FOCUS])
IF TYPE=code: RUN feedback; fail → fix, CONTINUE
SCORES = rate(RESULT)
LOG(iter=i, FOCUS, SCORES)
IF TYPE=code: git commit -m "ralph: iter [i] - [FOCUS]"
IF all(SCORES)==10: FINALIZE
IF i==5: WARN "Max iter"; FINALIZE
```

## FINALIZE

```
LOG "✅ COMPLETE"
DISPLAY: RESULT + journey table
PROMPT "1. New task  2. Add criteria  3. Exit"
```

## RUBRIC

| Score | Meaning |
|-------|---------|
| 1-3 | Broken |
| 4-6 | Gaps |
| 7-8 | Minor |
| 9 | Nitpicks |
| 10 | Perfect |
