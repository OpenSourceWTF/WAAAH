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
**Version:** 1.0 | **Status:** Ready

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
```
