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
4. **Code tasks**: `pnpm typecheck && pnpm test && pnpm lint` must pass
5. **Non-code tasks**: Verify against stated success criteria
6. Output `<promise>CHURLISH</promise>` only when 10/10 achieved

## Task Types

| Type | Examples | Verification |
|------|----------|--------------|
| **Code** | Features, fixes, refactors | `pnpm typecheck && test && lint` |
| **Docs** | README, API docs, guides | Accuracy, completeness, clarity |
| **Specs** | Design docs, RFCs, ADRs | Feasibility, coverage, clarity |
| **Config** | CI/CD, tooling, env setup | Works when applied |
| **Design** | UI mockups, architecture | Meets requirements, coherent |
| **Other** | Research, analysis, brainstorming, data tasks | User-defined success criteria |

## State Machine
```
INIT → COLLECT ⏸️→ PLAN ⏸️→ EXECUTE → SCORE ⏸️→ [LOOP | FINALIZE ⏸️]
         ↑                                  ↓
         └──────────────────────────────────┘
```

## Default Criteria

| Criterion | Definition | 10/10 = |
|-----------|------------|---------|
| clarity | Zero ambiguity | Self-explanatory to newcomers |
| completeness | All cases covered | Edge cases, error paths handled |
| correctness | No bugs/errors | Tests pass OR meets stated criteria |

## Scoring Rubric

| Score | Meaning |
|-------|---------|
| 1-3 | Fundamentally broken or missing |
| 4-6 | Works but has gaps |
| 7-9 | Good, minor improvements possible |
| 10 | Perfect, no improvements needed |

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

### EXECUTE

**For Code tasks:**
1. Write/update tests for current phase
2. Implement feature
3. Run: `pnpm typecheck && pnpm test && pnpm lint`
4. If failing → debug and fix
5. Repeat until green

**For Non-Code tasks:**
1. Draft content/design/output
2. Self-review against success criteria
3. If gaps → iterate and improve
4. Finalize when criteria met

Log progress to `progress.md`.

### SCORE
Rate each criterion 1-10 with justification.

```markdown
| Criterion | Score | Justification |
|-----------|-------|---------------|
| clarity | 8/10 | Clear but needs examples |
| completeness | 7/10 | Missing edge case docs |
| correctness | 10/10 | All tests pass / criteria met |
```

Git commit: `git commit -m "ralph: iter N - C/C/C scores"`

Circuit breaker check:
- If same total score 3x in a row → ⏸️ escalate to user

⏸️ `notify_user` scores table → "Continue refining?"

### LOOP (if any < 10 AND iter < 5)
Focus on lowest score:

| Criterion | Strategy |
|-----------|----------|
| clarity | Simplify, add examples, improve structure |
| completeness | Add missing sections, cover edge cases |
| correctness | Fix errors, verify against criteria |

→ EXECUTE

### FINALIZE
When all scores = 10:
1. Log `✅ COMPLETE` + final scores
2. Output: `<promise>CHURLISH</promise>`
3. Git commit: `git commit -m "ralph: complete - 10/10/10"`

⏸️ `notify_user` result → "1. New task  2. Add criteria  3. Exit"

### STUCK (max iterations reached without 10/10)
Document in `progress.md`:
- What was attempted
- Blocking issues
- Suggested alternatives
- Hand off to human

⏸️ `notify_user` blockers → request guidance
