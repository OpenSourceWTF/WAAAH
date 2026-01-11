---
name: waaah-spec
description: Interactive spec generation with quality gate
---

# WAAAH Spec Generator

**Vague idea → 10/10 spec + tasks with dependencies.**

## Core Rules
1. `notify_user` + await at every ⏸️
2. Log each iteration to `.waaah/specs/NNN-slug/spec.md`
3. NEVER finalize below 10/10
4. ALWAYS challenge vague answers
5. Open Questions MUST be resolved before status = "Ready"
6. Every spec MUST have Implementation + Verification tasks

## State Machine
```
INIT → COLLECT ⏸️→ INTERVIEW ⏸️→ [LOOP | FINALIZE ⏸️→ TASKS ⏸️]
          ↑             ↓
          └─────────────┘
```

## Default Criteria

| Criterion | Definition |
|-----------|------------|
| completeness | All features defined |
| specificity | No ambiguous requirements |
| testability | Every requirement verifiable |

## Workflow

### INIT
Check `.waaah/specs` for incomplete sessions.
If found: ⏸️ `notify_user "Resume [folder]?"` → await

### COLLECT
1. ⏸️ `notify_user "What are you building? Who? What problem?"` → await
2. ⏸️ `notify_user "Criteria? (default: completeness, specificity, testability)"` → await
3. Create `.waaah/specs/NNN-slug`
4. ⏸️ `notify_user "Start interview?"` → await

### INTERVIEW
Analyze gaps, score 1-10, generate 2-5 targeted questions.

| Question Type | Template |
|---------------|----------|
| Edge | "What happens if [X] fails?" |
| Flow | "After [action], what next?" |
| Conflict | "You said X but also Y - which wins?" |
| Scope | "Is [feature] v1 or later?" |
| API | "What's the request/response shape for [endpoint]?" |
| Reconcile | "Did implementation reveal anything the spec missed?" |

⏸️ `notify_user` with score + gaps + questions → await

### LOOP (if score < 10)
Process response → update spec → INTERVIEW

### FINALIZE (if score = 10)
Generate spec.md using TEMPLATE. Save to `.waaah/specs/NNN-slug/spec.md`.
⏸️ `notify_user` spec summary → await approval

### TASKS
Generate two types of tasks:

**Implementation Tasks (T-prefix):** Build the feature.
**Verification Tasks (V-prefix):** E2E tests proving feature works.

| Task Type | Verify Command |
|-----------|----------------|
| CLI | `node dist/index.js --help \| grep "expected"` |
| API | `curl localhost:3000/health \| jq .status` |
| Component | `pnpm test -- ComponentName` |
| E2E | `pnpm test -- feature.e2e --grep "scenario"` |

**Format:**
```
## Implementation Tasks
| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | [title] | S/M/L | — | [cmd] |

## Verification Tasks (E2E)
| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | E2E: [scenario] | S/M | T1,T2 | [e2e cmd] |
```

**Rules:**
- Every major feature needs at least 1 V-task
- V-tasks depend on their related T-tasks
- V-tasks test integration, not unit behavior
- Verify commands MUST be runnable (full path, `--grep` patterns)

⏸️ `notify_user` with both tables → "Confirm to assign?"

On confirm:
```
t1_id = assign_task({ prompt, verify })
v1_id = assign_task({ prompt, dependencies: [t1_id], verify })
```

Report: `✅ Spec saved. [N] implementation + [M] verification tasks queued.`

## SPEC TEMPLATE

```markdown
# [Name] Specification
**Version:** 1.0 | **Status:** Draft/Ready/Implemented/Validated
**Depends On:** [Spec-XXX] (if any)
**Related Workflows:** `waaah-xxx` (if any)

## 1. Overview
Problem: [X] | Users: [Y] | Solution: [Z]

## 2. User Stories
- [ ] US-1: As [user], I want [action], so that [benefit]

## 3. Requirements
| ID | Requirement |
|----|-------------|
| FR-1 | [functional] |
| NFR-1 | [non-functional] |

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

## 7. Implementation Tasks
| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **[Component]: [Description]** | S/M/L | — | `[runnable command]` |

## 8. Verification Tasks (E2E)
| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: [Scenario]** | M | T1,T2 | `pnpm test -- [file].e2e.ts` |

## 9. API Contracts (if applicable)
| Endpoint | Method | Request | Response | Errors |
|----------|--------|---------|----------|--------|

## 10. Open Questions
| Question | Status | Resolution |
|----------|--------|------------|
| [question] | OPEN/RESOLVED | [answer if resolved] |
```

