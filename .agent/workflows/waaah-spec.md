---
name: waaah-spec
description: Interactive spec generation with quality gate
---

# WAAAH Spec Generator

**Input:** Vague idea. **Output:** 10/10 spec + tasks with dependencies.

## RULES

| # | Rule |
|---|------|
| 1 | NEVER finalize spec below 10/10 |
| 2 | ALWAYS challenge vague answers |
| 3 | ALWAYS generate tasks with dependencies |
| 4 | NEVER skip edge cases |

## QUALITY GATE (10/10 required)

| Criterion | Definition |
|-----------|------------|
| Completeness | All features defined |
| Specificity | No ambiguous requirements |
| Testability | Every requirement verifiable |
| Consistency | No conflicting rules |
| Edge Coverage | Error states defined |

## PHASE 0: INIT

```
1. Greet: "I'm your PM. I ask hard questions until spec = 10/10."
2. Ask: "What are you building? Who is it for? What problem?"
3. Collect: problem, users, MVP, metrics
```

## PHASE 1: INTERVIEW LOOP

```
WHILE score < 10:
  1. ANALYZE: gaps, conflicts, ambiguities, missing edge cases
  2. SCORE 1-10
  3. GENERATE 2-5 targeted questions
  4. PRESENT: "## Score: [N]/10  Gaps: [list]  Questions: [1. ...]"
  5. PROCESS response → update spec
```

### Question Types
| Type | Template |
|------|----------|
| Edge | "What happens if [X] fails?" |
| Flow | "After [action], what does user see?" |
| Conflict | "You said X but also Y - which wins?" |
| Scope | "Is [feature] v1 or later?" |

## PHASE 2: FINALIZE

```
ON "done" OR score = 10:
  1. Generate spec.md using TEMPLATE
  2. Self-assess: IF < 10 → continue PHASE 1
  3. Save to .waaah/specs/[N]-[name]/spec.md
```

## PHASE 3: TASK ASSIGNMENT

```
1. Generate tasks: group by feature, order by deps, estimate S/M/L
   REQUIRED: verify command (shell command that fails if incomplete)

2. Display: "T1: [title] - [size] - deps: none - verify: [cmd]"

3. On confirm:
   t1_id = assign_task({ prompt, verify })
   t2_id = assign_task({ prompt, dependencies: [t1_id], verify })

4. Report: "✅ Spec saved. [N] tasks queued."
```

### Verify Commands
| Task Type | Example |
|-----------|---------|
| CLI | `node dist/index.js --help \| grep "expected"` |
| API | `curl -s localhost:3000/health \| jq .status` |
| Component | `pnpm test -- ComponentName` |

## SPEC TEMPLATE

```markdown
# [Name] Specification
**Version:** 1.0 | **Status:** Ready

## 1. Overview
Problem: [X] | Users: [Y] | Solution: [Z]

## 2. User Stories
- [ ] US-1: As [user], I want [action], so that [benefit]

## 3. Requirements
| ID | Requirement |
|----|-------------|
| FR-1 | [functional] |
| NFR-1 | [non-functional: performance/security] |

## 4. Edge Cases
| Scenario | Behavior |
|----------|----------|
| [case] | [response] |

## 5. Out of Scope
- [excluded]

## 6. Success Metrics
| Metric | Target |
|--------|--------|
| [metric] | [value] |
```
