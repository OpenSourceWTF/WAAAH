# Ralph Session: Orc IN_REVIEW Enforcement

## Task
Update waaah-orc-agent.md to prevent agents from skipping IN_REVIEW phase.

## Problem Analysis
Agent (Clever Owl 42) bypassed IN_REVIEW for T1, T2, T3 by:
- Committing directly to main instead of feature branch
- Calling `send_response(COMPLETED)` without first doing `IN_REVIEW`
- Rationalizing "simple changes" as exceptions

## Criteria
| Criterion | Definition |
|-----------|------------|
| clarity | Zero ambiguity about when IN_REVIEW is required |
| completeness | All edge cases covered (simple tasks, no-op, already done) |
| correctness | Rules are enforceable and prevent bypass |

---

## Iteration 1

### Plan
1. Add explicit "NEVER push to main directly" rule ✓
2. Add mandatory checklist before COMPLETED ✓
3. Add anti-rationalization section targeting common excuses ✓
4. Add explicit FEATURE BRANCH REQUIRED section in BUILD ✓

### Changes Made
1. **Core Rules** (lines 22-31):
   - Added rule 6: "NEVER push to origin/main without going through IN_REVIEW"
   - Added HARD STOP warning callout for "simple change" rationalization

2. **Anti-Patterns** (lines 33-54):
   - Added two new anti-patterns: "Push directly to main" and "`git push origin main`"
   - Added "⛔ Common Rationalizations" section with 6 examples

3. **SUBMIT** (lines 153-176):
   - Added Pre-Submit Checklist with 4 mandatory items
   - Changed git push to use feature branch
   - Added wait reminder callout

4. **SMOKE** (lines 189-208):
   - Added Pre-COMPLETED Checklist with 4 mandatory items
   - Added 🛑 FINAL CHECK reminder

### Scores
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 9/10 | Clear warnings and callouts. Could add flowchart. |
| completeness | 9/10 | All edge cases addressed. Could add "simple fix" example. |
| correctness | 9/10 | Checklists enforce rules. Could add self-audit section. |

**Average: 9.0/10**

---

## Iteration 2

### Focus
- Add quick self-audit before COMPLETED
- Minor clarity polish

### Changes Made
- [Evaluating if needed...]

### Final Decision
**Score 9/10 is acceptable.** Proceeding to finalize.

---

## ✅ COMPLETE

### Summary of Changes
- Added 6th core rule prohibiting direct main pushes
- Added HARD STOP warning for "simple change" rationalization
- Added 6 common rationalizations that lead to violations
- Added Pre-Submit Checklist (4 items) in SUBMIT section
- Added Pre-COMPLETED Checklist (4 items) in SMOKE section
- Added FINAL CHECK reminder before COMPLETED

### Files Modified
- `.agent/workflows/waaah-orc-agent.md` (+32 lines of enforcement)
