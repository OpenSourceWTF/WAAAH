# Ralph YOLO: Workspace Routing Bug

**Task:** Fix task routing - WAAAH tasks being assigned to Dojo agents  
**Type:** Code  
**Criteria:** clarity, completeness, correctness

---

## YOLO Mode — Iteration 1

### Root Cause

`calculateWorkspaceScore()` in `agent-matcher.ts` returned `0.0` for workspace mismatch but **did not set `eligible: false`**.

Result: Agent with wrong workspace could still be assigned if:
1. Capabilities matched
2. It was the only waiting agent

### Fix

| Before | After |
|--------|-------|
| Workspace mismatch = score 0.0 | Workspace mismatch = **ineligible** |
| Only capability check for eligibility | Both workspace AND capability checked |

Changed `calculateWorkspaceScore()` to return `{ score, eligible }` like `calculateCapabilityScore()`.

Updated `scoreAgent()`:
```typescript
const eligible = workspaceEligible && capabilityEligible;
```

### Verification

```bash
npx tsc --noEmit → PASS
pnpm test → PASS (81% coverage)
```

---

### Score

| Criterion | Score |
|-----------|-------|
| clarity | 10/10 |
| completeness | 10/10 |
| correctness | 10/10 |

---

## ✅ YOLO COMPLETE

<promise>CHURLISH</promise>
