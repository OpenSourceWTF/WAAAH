# Ralph YOLO: Add capability inference to spec

## Iteration 1

**Original Task:** we need to add capability inference based on job type agaisnt the set of standard capabilties to @[.agent/workflows/waaah-spec.md]
**Focus this iteration:** Update `waaah-spec.md` with explicit instructions for capability inference.
**Previous scores:** N/A

### Decision Log
- **Why this approach?**: Direct edit to the workflow file to include the rules.
- **Alternates considered**: None, user request is specific.

### Execution Log
- **Raw Result**: Success. Added `CAPABILITY INFERENCE` section and updated task assignment logic.
- **Diff Summary**: Added ~30 lines of rules.

### Score

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 10/10 | Explicit rules: "NEVER include code-doctor" for Impl/Verify. |
| completeness | 10/10 | Maps all standard caps to task types. Included `inferCapabilities` step. |
| correctness | 10/10 | Matches `packages/types` definitions. |

## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- **clarity**: Added explicit "Standard Capabilities" list and "Inference Rules" blocking improper usage of `code-doctor`.
- **completeness**: covered all major task types (Impl, Verify, Doc, Audit).
- **correctness**: Syntax valid, logic aligns with user intent.

<promise>CHURLISH</promise>

