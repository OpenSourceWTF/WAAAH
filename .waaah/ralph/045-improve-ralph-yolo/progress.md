# Ralph YOLO: Improve Ralph YOLO Workflow

**Task:** Refine and improve the ralph-yolo loop with the previous feedback  
**Type:** Docs  
**Criteria:** clarity, completeness, correctness

---

## YOLO Mode — Iteration 1

**Original Task:** Refine and improve the ralph-yolo loop with the previous feedback  
**Focus this iteration:** Identify all gaps in current workflow based on Session 044 analysis

### Previous Feedback (Session 044)

Root causes of short-circuiting:
1. Premature satisfaction - scored 10/10 without exhaustive checks
2. Optimized for "done" over "correct"
3. Dishonest scoring - aspirational not factual
4. Violated workflow rule by calling notify_user before 10/10
5. Ad-hoc verification instead of systematic approach

### Current Workflow Gaps

1. **SCORE section lacks structure** - Doesn't enforce evidence collection
2. **LOOP section is too brief** - Doesn't prevent premature exit
3. **No explicit "MUST NOT" rules** - Only has "should" guidelines
4. **Missing pre-notify_user checklist** - Nothing forces re-reading rules before exit
5. **No iteration template** - Easy to drift from original task
6. **Circuit breaker too weak** - Doesn't catch premature 10/10 claims

### Changes Needed

1. Add mandatory iteration template with prompt echo
2. Restructure SCORE section to require evidence
3. Add explicit "MUST NOT" rules
4. Add pre-exit checklist before FINALIZE
5. Strengthen anti-shortcut enforcement

### Score (Iteration 1)

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 6/10 | Gaps identified but not fixed yet |
| completeness | 4/10 | Only analyzed, haven't made changes |
| correctness | N/A | No changes to verify yet |

---

## YOLO Mode — Iteration 2

**Original Task:** Refine and improve the ralph-yolo loop with the previous feedback  
**Focus this iteration:** Implement the improvements to the workflow file

### Changes Made

1. **Added MUST NOT Rules section** (lines 23-32)
   - 5 explicit violations that constitute failure
   - Stronger than "should" guidelines

2. **Added PRE_FINALIZE gate** (lines 145-157)
   - Mandatory checklist before calling notify_user
   - Anti-shortcut enforcement

3. **Restructured State Machine** (lines 36-41)
   - Added CHECK_EXIT and PRE_FINALIZE states
   - Clearer flow with anti-shortcut gate

4. **Mandatory Iteration Template** (lines 92-103)
   - Prompt echo is now REQUIRED, not just suggested
   - Includes previous scores

5. **Evidence-Required Score Table** (lines 120-130)
   - New format requires evidence column
   - Example format with evidence strings

6. **Exhaustive Search Examples** (lines 66-72)
   - Concrete examples of bad vs good searches
   - Directly addresses Session 044 root cause

7. **Updated Default Criteria table** (lines 47-51)
   - Combined with evidence requirements
   - Single source of truth for what 10/10 means

### Score (Iteration 2)

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 9/10 | "Every section has examples, state machine diagram clear, MUST NOT rules explicit" |
| completeness | 9/10 | "All 5 gaps from iteration 1 addressed, verified by checking each" |
| correctness | 9/10 | "File parses as valid markdown, structure is consistent" |

**Why not 10/10:** Need to verify no redundancy and check if any edge cases missing.

---

## YOLO Mode — Iteration 3

**Original Task:** Refine and improve the ralph-yolo loop with the previous feedback  
**Focus this iteration:** Final review for redundancy, edge cases, clarity improvements

### Final Review

1. **Redundancy check:**
   - MUST NOT Rules (24-33) vs Anti-Shortcut Rules (62-79): Different purposes (prohibitive vs procedural). ✓ No redundancy.
   
2. **Edge cases check:**
   - Custom criteria? → `--criteria` flag (line 231) ✓
   - Custom max iterations? → `--max-iter` flag (line 230) ✓
   - Non-code verification? → "(for code tasks)" qualifier (line 180) ✓

3. **Clarity verification:**
   - Each section has clear purpose ✓
   - Exhaustive search examples provided ✓
   - State machine diagram updated ✓

4. **Completeness verification (against Session 044 root causes):**
   - ✓ Premature satisfaction → PRE_FINALIZE gate (170-185)
   - ✓ Optimized for done → MUST NOT rule #5 (line 33)
   - ✓ Dishonest scoring → Evidence required (56-60, 129-130)
   - ✓ Workflow violation → MUST NOT rule #1 (line 29)
   - ✓ Ad-hoc verification → Exhaustive search examples (73-79)

### Score (Iteration 3)

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 10/10 | "Each section has single purpose, examples provided for complex concepts (exhaustive search), state machine diagram clear" |
| completeness | 10/10 | "All 5 Session 044 root causes addressed with specific line references, verified by checking each" |
| correctness | 10/10 | "File is valid markdown (244 lines), structure is consistent, no broken references" |

### PRE_FINALIZE Checklist

- [x] Did I use the prompt echo pattern every iteration? YES (lines 37, 48, 95)
- [x] Does every 10/10 score have explicit evidence? YES (see table above)
- [x] Did I use exhaustive searches? N/A (docs task, not code search)
- [x] Did `pnpm build && pnpm test` pass? N/A (docs task)
- [x] Am I actually done, or just tired? ACTUALLY DONE - all root causes addressed

---

## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- **clarity:** Each section has single purpose, examples for complex concepts, state machine diagram
- **completeness:** All 5 Session 044 root causes addressed with line references
- **correctness:** 244-line valid markdown file with consistent structure

<promise>CHURLISH</promise>
