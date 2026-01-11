# Fix Orc Skipping Review

**Task:** Orc agent is sending tasks directly to COMPLETED instead of IN_REVIEW first.

**Type:** `code`

**Criteria:** `clarity`, `completeness`, `correctness`

---

## Iteration 0: PLAN

### Problem
Orc agent skips IN_REVIEW and sends directly to COMPLETED.

### Root Cause
**SMOKE GATE section (lines 120-128) is ambiguous:**

```
1. IF ctx.verify → RUN verify; fail → fix
2. GRUMPY: "Can stranger run [cmd]?" No → not done
3. STUB: grep "TODO|Not implemented"; found → not done
4. Pass all → send_response(COMPLETED)  ← THIS IS THE BUG
```

This tells the orc to send COMPLETED after smoke tests pass, but:
- Rule 2 says: "NEVER send_response(COMPLETED) until merged"
- Rule 3 says: "ALWAYS send_response(IN_REVIEW) when build done"

**The SMOKE GATE should only run AFTER merge, not after build.**

### Proposed Fix
Restructure the workflow to be explicit about the two separate flows:

1. **BUILD flow:** Build done → IN_REVIEW → wait for approval
2. **MERGE flow:** Approved → Merge → SMOKE GATE → COMPLETED

**Changes:**
- Move SMOKE GATE into PHASE 3: MERGE (after merge succeeds)
- Make it clear that COMPLETED only happens after merge + smoke

*(Awaiting approval)*
