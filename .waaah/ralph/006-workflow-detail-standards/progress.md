# Ralph Progress: Workflow Detail Standards

## Task
1. Orc: Add a standard level of detail for write-ups
2. Doctor: Generate extremely detailed and specific prompts

## Type: `doc`

## Criteria
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10 | Clear templates with placeholders |
| completeness | 10 | Both workflows updated |
| correctness | 10 | Templates match intended use |

---

## Changes Made

### Orc Workflow
Added **Write-up Standard** section before Submit:
- Summary (1-2 sentences)
- Changes (file: what changed)
- Testing (checklist)

### Doctor Workflow
Replaced simple `assign_task({ prompt })` with detailed template:
- Problem (violation type, file, line)
- Evidence (metric, threshold, command, output)
- Required Fix (actionable)
- Acceptance Criteria (checkboxes)
- Context (commit, author, related files)

---

## ✅ COMPLETE

| Iter | Focus | Scores |
|------|-------|--------|
| 0 | Implementation | 10,10,10 |
