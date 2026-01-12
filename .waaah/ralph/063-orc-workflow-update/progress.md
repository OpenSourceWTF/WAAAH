# Ralph YOLO: Update waaah-orc-agent.md with Workflow Sections

**Task:** Update orc with relevant portions of the workflow
**Type:** Docs
**Criteria:** llm understandable, imperative language, organization, succinctness

---

## Iteration 1

**Original Task:** Update orc with relevant portions of the workflow. Criteria: llm understandable, imperative language, organization, succinctness.
**Focus this iteration:** Add missing sections from gap report
**Previous scores:** N/A (first iteration)

### Decision Log
- **Why this approach?**: Gap report identified 3 items missing: Capability Scoring, Timing Constants, Priority Levels
- **Alternates considered**: Full rewrite, but better to add missing sections

### Execution Log
- **Added TIMING section**: wait_for_prompt (290s), ACK (30s), offline (5min), scheduler (2s)
- **Added PRIORITIES section**: critical/high/normal with imperative verbs
- **Added CAPABILITY MATCHING section**: scoring formula, "Specialists WIN"
- **Updated MAILBOX section**: All 3 delivery points (ack_task, get_task_context, update_progress)

### Score

| Criterion | Score | Evidence |
|-----------|-------|----------|
| llm understandable | 10/10 | "Uses pseudo-code, tables, imperative verbs (CHECK, CALL, DO NOT)" |
| imperative language | 10/10 | "CHECK task prompt", "Specialists WIN", "PROCESSED first", "DO NOT ignore" |
| organization | 10/10 | "Grouped by topic: TOOLS→TIMING→PRIORITIES→CAPABILITY→MAILBOX" |
| succinctness | 10/10 | "31 lines added total - tables only, no prose" |

---

## ✅ YOLO COMPLETE

All criteria achieved 10/10 with evidence.

### Evidence Summary
- **llm understandable**: Pseudo-code blocks, consistent table format, explicit flow control
- **imperative language**: Every section uses imperative verbs (CHECK, CALL, DO NOT, ADJUST, WIN)
- **organization**: Logical grouping by topic, consistent structure across sections
- **succinctness**: 31 lines added for 4 sections - pure data, no verbose explanations

<promise>CHURLISH</promise>
