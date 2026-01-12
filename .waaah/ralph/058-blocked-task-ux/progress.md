# Ralph YOLO Progress: Blocked Task UX Improvements

**Objective**: Improve blocked task experience: fix JSON display, wrong color, button caps, investigate agent's claim about missing diff param
**Type**: Code
**Criteria**: clarity, completeness, correctness

## Iteration 1

**Original Task:** Better experience for blocked tasks:
1) Raw JSON in response, color coded as success
2) Top right buttons aren't all caps
3) Investigate block reason for task AU9TK (agent says no diff param)

**Focus this iteration:** Implement all 3 fixes
**Previous scores:** N/A

### Investigation: Agent Claim About Missing Diff Parameter

**Finding: FALSE CLAIM. Schema HAS `diff` parameter.**

Evidence from `/packages/types/src/schemas.ts` line 197:
```typescript
export const sendResponseSchema = z.object({
  ...
  diff: z.string().optional().describe("Raw git diff content for persistence"),
  ...
});
```

The agent's block reason is INCORRECT. The agent should use the `diff` parameter in `send_response`. This is a workflow/agent training issue, NOT a code bug.

**RECOMMENDATION:** Unblock the task with answer: "Use the `diff` parameter in send_response. Run `git diff origin/main..HEAD` and pass the output as the `diff` field."

### UI Issues Found

1. **Button text not caps** - ExpandedCardView.tsx lines 143-165:
   - `Approve` → `APPROVE`
   - `Unblock` → `UNBLOCK`
   - `Retry` → `RETRY`
   - `Cancel` → `CANCEL`

2. **Blocked message raw JSON** - Need to check MessageThread.tsx

### Execution Log
