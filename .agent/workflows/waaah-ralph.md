---
name: waaah-ralph
description: Interactive task refinement with custom quality gates
---

# WAAAH Ralph

**Task + Criteria → Loop until 10/10.**

## Core Rules
1. `notify_user` + await at every ⏸️
2. Log every iteration to `.waaah/ralph/NNN-slug/progress.md`
3. Max 5 iterations (circuit breaker: escalate if same scores 3x)
4. **Code tasks**: `pnpm build && pnpm test` must pass
5. **Non-code tasks**: Verify against stated success criteria
6. Output `<promise>CHURLISH</promise>` only when 10/10 achieved

## MUST NOT Rules

> [!CAUTION]
> Violating these rules is a FAILURE, even if task appears complete.

1. **MUST NOT** score 10/10 without explicit evidence
2. **MUST NOT** skip the prompt echo at start of each iteration
3. **MUST NOT** use targeted searches when exhaustive search is needed
4. **MUST NOT** assume work is complete - prove it with verification

## Task Types

| Type | Examples | Verification |
|------|----------|--------------|
| **Code** | Features, fixes, refactors | `pnpm build && pnpm test` |
| **Docs** | README, API docs, guides | Accuracy, completeness, clarity |
| **Specs** | Design docs, RFCs, ADRs | Feasibility, coverage, clarity |
| **Config** | CI/CD, tooling, env setup | Works when applied |
| **Design** | UI mockups, architecture | Meets requirements, coherent |
| **Other** | Research, analysis, brainstorming | User-defined success criteria |

## State Machine
```
INIT → COLLECT ⏸️→ PLAN ⏸️→ EXECUTE → SCORE → CHECK_EXIT → [LOOP | PRE_FINALIZE ⏸️| FINALIZE ⏸️]
         ↑                                                          ↓
         └──────────────────────────────────────────────────────────┘
```

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
Check `.waaah/ralph` for incomplete sessions.
If found: ⏸️ `notify_user "Resume [folder]?"` → await

### COLLECT
1. ⏸️ `notify_user "Task?"` → await
2. Detect task type (code/docs/specs/config/design/other)
3. ⏸️ `notify_user "Criteria? (default: clarity, completeness, correctness)"` → await
4. Create `.waaah/ralph/NNN-slug`
5. ⏸️ `notify_user "Start?"` → await

### PLAN
Draft approach in `progress.md`:
- **Goal**: What we're building/writing
- **Type**: Code | Docs | Specs | Config | Design | Other
- **Phases**: Incremental steps (for complex tasks)
- **Success Criteria**: Measurable outcomes
- **Verification**: How we'll validate

⏸️ `notify_user` plan summary → await approval

### Iteration Template (MANDATORY)

Every iteration MUST start with in progress.md:

```markdown
## Iteration N

**Original Task:** [paste the exact user task here]
**Focus this iteration:** [what you're working on now]
**Previous scores:** [X/Y/Z or N/A if first iteration]

### Decision Log
- **Why this approach?**: [reasoning]
- **Alternates considered**: [brief note]

### Execution Log
- **Command/Action**: [e.g. `pnpm test`]
- **Raw Result**: [summary of output, e.g. "3 tests failed"]
- **Diff Summary**: [what changed in files]
```

This prevents drift from original task.

### EXECUTE

**For Code tasks:**
1. Write/update tests for current phase
2. Implement feature
3. Run: `pnpm build && pnpm test`
4. If failing → debug and fix (max 3 attempts per iteration)

**For Non-Code tasks:**
1. Draft content/design/output
2. Self-review against success criteria
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

Git commit: `git commit -m "ralph: iter N - C/C/C scores"`

### CHECK_EXIT

**If any score < 10:**
- → LOOP

**If all scores = 10:**
- → PRE_FINALIZE

**If circuit breaker triggered:**
- ⏸️ `notify_user` with blockers → request guidance

### LOOP (if any < 10 AND iter < 5)
Focus on lowest score:

| Criterion | Strategy |
|-----------|----------|
| clarity | Simplify, add examples, improve structure |
| completeness | Find missing parts with exhaustive search |
| correctness | Fix errors, re-run verification |

→ Return to EXECUTE with next iteration template

### PRE_FINALIZE (Anti-Shortcut Gate)

> [!CAUTION]
> This step is MANDATORY before finalizing.

**Checklist (all must be YES):**

- [ ] Did I use the prompt echo pattern every iteration?
- [ ] Does every 10/10 score have explicit evidence?
- [ ] Did I use exhaustive searches (not just targeted greps)?
- [ ] Did `pnpm build && pnpm test` pass (for code tasks)?
- [ ] Am I actually done, or just tired of iterating?

If ANY answer is NO → return to LOOP.

If ALL answers are YES:

⏸️ `notify_user` scores table → "All 10/10 with evidence. Finalize?"

### FINALIZE

When all scores = 10 with evidence:

```markdown
## ✅ COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- clarity: [summary]
- completeness: [summary]
- correctness: [summary]

<promise>CHURLISH</promise>
```

Git commit: `git commit -m "ralph: complete - 10/10/10"`

⏸️ `notify_user` result → "1. New task  2. Add criteria  3. Exit"

### STUCK (max iterations without 10/10)
Document in `progress.md`:
- What was attempted
- Blocking issues
- Suggested alternatives
- Hand off to human

⏸️ `notify_user` blockers → request guidance
