# Improve Ralph Workflow Reliability

**Task:** Make the waaah-ralph workflow more reliable by addressing agent behavior issues:
1. Agent prematurely enters execution mode without user confirmation
2. Ralph loop sometimes does nothing when initialized or given criteria

**Type:** `optimize`

**Criteria:** `reliability`, `succinctness`, `llm_optimized`

---

## Design Decisions

### State Machine?
**YES** — A state machine provides:
- Explicit allowed transitions (prevents skipping states)
- Clear "BLOCKED" states that require user input
- Visual representation agents can follow

**Proposed States:**
```
INIT → COLLECT → EXECUTE → SCORE → [LOOP | FINALIZE]
         ↑                    ↓
         └────────────────────┘
```

**Blocking States:** `COLLECT`, `SCORE` (require user confirmation)

### Ralph Promise (from ghuntley.com/ralph)
**Core Philosophy:**
- "Ralph is a loop" — `while :; do cat PROMPT.md | claude-code; done`
- "Faith in eventual consistency" — Ralph will test you, but gets better with tuning
- "Ralph gets tuned like a guitar" — Each failure = add a sign/guardrail
- "Signs next to the slide" — Explicit instructions prevent repeated mistakes

**Key Insight:** Ralph is not about getting it right the first time. It's about iterating until perfection, with each failure informing the next guardrail.

---

## Iteration 0

### Current Workflow Issues

1. **Missing User Gates**
   - Only 1 gate (`PROMPT "Start?"`)
   - No confirmation after EXECUTE or between iterations

2. **Pseudocode Too Symbolic**
   - `do(TASK)`, `rate(RESULT)` are vague
   - LLMs parse prose better than compact pseudocode

3. **No Mandated Tool Calls**
   - Agents don't know to use `notify_user` to block

### Scores

| Criterion | Score | Notes |
|-----------|-------|-------|
| reliability | 4 | Agents skip states, no enforcement |
| succinctness | 6 | Compact but too cryptic |
| llm_optimized | 4 | Pseudocode confuses agents |

---

## Next: Iteration 1

Rewrite workflow with:
1. State machine with explicit transitions
2. `⏸️ STOP` markers requiring `notify_user`
3. Natural language steps
4. Ralph Promise preamble

---

## Iteration 1

### Changes Made

1. **State Machine Diagram** — Visual representation of allowed transitions
2. **5 Explicit Gates:**
   - COLLECT: "Start?" confirmation
   - PLAN (NEW): Show approach, await approval before execution
   - SCORE: Show scores, ask "Continue refining?"
   - FINALIZE: Confirm completion
3. **Conservative Rule Added:** "Never auto-proceed; always `notify_user` at gates"
4. **Ralph Promise Preamble** — Included at top of workflow
5. **Natural Language Steps** — Replaced compact pseudocode with prose

### Scores

| Criterion | Score | Notes |
|-----------|-------|-------|
| reliability | 7 | 5 explicit gates enforce user control |
| succinctness | 6 | Longer but clearer |
| llm_optimized | 7 | Prose + visual state machine |

### Focus for Iteration 2
`succinctness` — Can we compress while maintaining clarity?
