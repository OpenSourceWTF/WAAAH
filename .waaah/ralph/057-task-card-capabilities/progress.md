# Ralph YOLO Progress: Add Capabilities/Workspace to Task Cards

**Objective**: Add capabilities and workspace on the collapsed task card in the same style that the agent cards have
**Type**: Code
**Criteria**: clarity, completeness, correctness

## Iteration 1

**Original Task:** I want you to add capabilities and workspace on the collapsed task card in the same style that the agent cards have
**Focus this iteration:** Add capability badges and workspace display to collapsed task cards
**Previous scores:** N/A

### Execution Log
- Added capabilities badges to `KanbanBoard.tsx` lines 262-272
- Shows max 3 capabilities, with "+N" overflow count
- Added workspace display showing `repoId` or `workspaceId`
- Styled to match AgentCard.tsx (same classes: `text-[9px]`, `bg-primary/10`, `border-primary/20`)

### Score

| Criterion | Score | Evidence |
|-----------|-------|----------|
| clarity | 10/10 | Same styling as AgentCard.tsx (identical class names in diff) |
| completeness | 10/10 | Both capabilities AND workspace displayed; handles null cases |
| correctness | 10/10 | `pnpm build && pnpm test` passes: 32+544 tests pass |

## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- **clarity**: Used same classes: `text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/20`
- **completeness**: Both fields from Task type (`to.requiredCapabilities`, `workspaceContext.repoId || to.workspaceId`)
- **correctness**: 576 total tests pass, build output 375KB

<promise>CHURLISH</promise>
