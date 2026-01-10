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
| 3 | Log: `.waaah/ralph/NNN-slug/progress.md` (numbered folders) |
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
  
  # Determine next session number
  EXISTING = ls .waaah/ralph | grep -E "^[0-9]{3}-" | sort -r | head -1
  IF EXISTING:
    LAST_NUM = extract leading 3-digit number from EXISTING
    NEXT_NUM = LAST_NUM + 1
  ELSE:
    NEXT_NUM = 1
  
  # Check for in-progress sessions (no "✅ COMPLETE" in progress.md)
  FOR each folder in .waaah/ralph sorted desc:
    IF folder/progress.md exists AND NOT contains "✅ COMPLETE":
      PROMPT "Resume session [folder]? (y/n)" → IF y:
        SESSION_DIR = .waaah/ralph/[folder]
        goto LOOP
  
COLLECT
  PROMPT "Task?" → TASK
  PROMPT "Criteria? (csv)" → CRITERIA[] | default: [clarity, completeness, correctness]
  TYPE = match(TASK, TASK_TYPES table)
  IF TYPE ∈ {optimize, spec}:
    PROMPT "Switch to /waaah-[TYPE]? (y/n)" → IF y: EXIT + follow
  
  # Create session folder with numbered slug
  SLUG = slugify(first 4 words of TASK)  # e.g., "fix-cli-wrapper"
  SESSION_DIR = .waaah/ralph/[printf "%03d" NEXT_NUM]-[SLUG]
  mkdir -p SESSION_DIR
  
  DISPLAY "Task: [TASK] | Type: [TYPE] | Criteria: [CRITERIA]"
  DISPLAY "Session: [SESSION_DIR]"
  PROMPT "Start? (y/n)" → IF n: EXIT

EXECUTE
  RESULT = do(TASK)
  IF TYPE=code:
    RUN: pnpm typecheck && pnpm test && pnpm lint
    IF fail: RESULT = fix errors first
  SCORES = rate(RESULT, each CRITERIA, 1-10)
  LOG(SESSION_DIR/progress.md, iteration=0, SCORES)
  IF TYPE=code: git commit -m "ralph: iter 0 - [SLUG]"

LOOP (i = 1..5)
  READ SESSION_DIR/progress.md
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
  LOG(SESSION_DIR/progress.md, iteration=i, FOCUS, SCORES_NEW, delta)
  IF TYPE=code: git commit -m "ralph: iter [i] - [FOCUS]"
  
  IF all(SCORES_NEW) = 10: goto FINALIZE
  IF i = 5: WARN "Max iterations"; goto FINALIZE
  SCORES = SCORES_NEW

FINALIZE
  LOG SESSION_DIR/progress.md "✅ COMPLETE"
  DISPLAY:
    [RESULT]
    | Iter | Focus | Δ |
    |------|-------|---|
    [journey from progress.md]
  PROMPT "1. New task  2. Add criteria  3. Exit"
```

---

## FOLDER STRUCTURE

```
.waaah/ralph/
├── 001-fix-cli-wrapper/
│   └── progress.md
├── 002-add-new-feature/
│   └── progress.md
├── 003-refactor-api/
│   └── progress.md
└── ...
```

Each session folder contains:
- `progress.md` - Full iteration history with scores and changes

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
