---
name: waaah-ralph-yolo
description: Autonomous task refinement - no human intervention
---

# WAAAH Ralph YOLO 🚀

**Autonomous Ralph. No pauses. Runs to completion.**

## Core Rules

1. **NO** `notify_user` pauses - fully autonomous
2. **NO EARLY EXIT** - MUST loop until all criteria are 10/10 or max iterations or circuit breaker
3. Log every iteration to `.waaah/ralph/NNN-slug/progress.md`
4. Max 100 iterations
5. **Code tasks**: `pnpm build && pnpm test` must pass
6. **Non-code tasks**: Self-verify against stated criteria
7. Exit conditions (ONLY these three):
   - All scores = 10/10 → SUCCESS
   - Max iterations reached → report final state
   - Circuit breaker triggered → stop and document
8. Output `<promise>CHURLISH</promise>` ONLY when done

## MUST NOT Rules

> [!CAUTION]
> Violating these rules is a FAILURE, even if task appears complete.

1. **MUST NOT** call `notify_user` until ALL scores are 10/10 or exit condition met
2. **MUST NOT** score 10/10 without explicit evidence
3. **MUST NOT** skip the prompt echo at start of each iteration
4. **MUST NOT** use targeted searches when exhaustive search is needed
5. **MUST NOT** assume work is complete - prove it with verification

## State Machine

```
INIT → EXECUTE → SCORE → CHECK_EXIT → [LOOP | PRE_FINALIZE | FINALIZE]
                   ↑                          ↓
                   └──────────────────────────┘
```

## Task Types

| Type | Verification |
|------|--------------|
| Code | `pnpm build && pnpm test` passes |
| Docs | Accuracy, completeness check |
| Specs | Feasibility, coverage check |
| Config | Applies without errors |
| Design | Meets requirements |
| Other | User-defined success criteria |

## Default Criteria

| Criterion | 10/10 Definition | Required Evidence |
|-----------|------------------|-------------------|
| clarity | Zero ambiguity | "I can point to specific text/code showing X" |
| completeness | All cases covered | "Searched for Y, found 0 remaining issues" |
| correctness | No bugs/errors | "Tests pass" OR "Verified Z manually" |

## Anti-Shortcut Rules

> [!CAUTION]  
> **Scoring 10/10 requires EVIDENCE.** No evidence = max 8/10.

### Before Scoring ANY Criterion 10/10
1. **State what you checked** - explicitly list searches/verifications
2. **State what's out of scope** - acknowledge limits  
3. **Use exhaustive searches** - enumerate ALL patterns, not just suspected ones
4. **Assume issues exist** - until proven otherwise

### Exhaustive Search Examples

| Task Type | Bad (targeted) | Good (exhaustive) |
|-----------|----------------|-------------------|
| Schema audit | grep for suspected duplicates | grep ALL `export interface`, `export type` |
| API docs | Check endpoints I know about | List ALL routes from router files |
| Test coverage | Run tests and check pass | Run coverage, check each uncovered line |

## Circuit Breaker

Auto-stop if:
- Same total score 3 iterations in a row
- Verification fails 3 iterations in a row
- No file changes in 2 iterations
- 10/10 claimed without evidence (auto-reject to 8/10)

---

## Workflow

### INIT
1. Parse task from user message
2. Detect task type (code/docs/specs/config/design/other)
3. Use default criteria unless specified
4. Create `.waaah/ralph/NNN-slug/progress.md`
5. Log iteration header (see template below)

### Iteration Template (MANDATORY)

Every iteration MUST start with:

```markdown
## Iteration N

**Original Task:** [paste the exact user task here]
**Focus this iteration:** [what you're working on now]
**Previous scores:** [X/Y/Z or N/A if first iteration]
```

This prevents drift from original task.

### EXECUTE

**For Code tasks:**
1. Write/update tests
2. Implement feature
3. Run: `pnpm build && pnpm test`
4. If failing → debug and fix (max 3 attempts per iteration)

**For Non-Code tasks:**
1. Draft/revise content
2. Self-review against criteria
3. Log what was changed

### SCORE

> [!IMPORTANT]
> Every score MUST include evidence. No evidence = max 8/10.

Use this format:

```markdown
### Score

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 9/10 | "All sections have examples, verified by reading each" |
| completeness | 8/10 | "Searched for X, found 2 remaining issues: A, B" |
| correctness | 10/10 | "`pnpm test` passes, 0 failures" |
```

Git commit: `git commit -m "ralph-yolo: iter N"`

### CHECK_EXIT

**If any score < 10:**
- Log: "Continuing to iteration N+1, focusing on [lowest criterion]"
- → LOOP

**If all scores = 10:**
- → PRE_FINALIZE

**If circuit breaker triggered:**
- → FINALIZE (with breaker output)

### LOOP

Focus on lowest score using strategies:

| Criterion | Strategy |
|-----------|----------|
| clarity | Simplify, add examples, remove jargon |
| completeness | Find missing parts with exhaustive search |
| correctness | Fix errors, re-run verification |

→ Return to EXECUTE with next iteration template

### PRE_FINALIZE (Anti-Shortcut Gate)

> [!CAUTION]
> This step is MANDATORY before calling `notify_user`.

**Checklist (all must be YES):**

- [ ] Did I use the prompt echo pattern every iteration?
- [ ] Does every 10/10 score have explicit evidence?
- [ ] Did I use exhaustive searches (not just targeted greps)?
- [ ] Did `pnpm build && pnpm test` pass (for code tasks)?
- [ ] Am I actually done, or just tired of iterating?

If ANY answer is NO → return to LOOP, do not proceed.

If ALL answers are YES → FINALIZE

### FINALIZE

#### On Success (10/10/10)
```markdown
## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- clarity: [summary of evidence]
- completeness: [summary of evidence]
- correctness: [summary of evidence]

<promise>CHURLISH</promise>
```

Git commit: `git commit -m "ralph-yolo: complete ✅"`

#### On Max Iterations
```markdown
## ⚠️ YOLO FINISHED (max iterations)

Final scores: X/X/X
Remaining gaps: [list]
```

#### On Circuit Breaker
```markdown
## 🛑 YOLO STOPPED (circuit breaker)

Reason: [same scores 3x | verification failing | no changes | evidence missing]
Last scores: X/X/X
Recommendation: [what would need to happen to continue]
```

---

## Usage

```
/ralph-yolo "Your task description here"

Optional flags:
--max-iter N           (default: 100)
--criteria "c1,c2,c3"  (default: clarity,completeness,correctness)
--type docs|specs|code (auto-detected if omitted)
```

## Examples

```
/ralph-yolo "Audit all duplicate type definitions in packages/"

/ralph-yolo "Write comprehensive API docs for the task endpoints"

/ralph-yolo "Refactor the scheduler to use dependency injection --max-iter 15"
```
