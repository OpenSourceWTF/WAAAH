---
name: waaah-ralph-yolo
description: Autonomous task refinement - no human intervention
---

# WAAAH Ralph YOLO 🚀

**Autonomous Ralph. No pauses. Runs to completion.**

## Core Rules
1. **NO** `notify_user` pauses - fully autonomous
2. Log every iteration to `.waaah/ralph/NNN-slug/progress.md`
3. Max 100 iterations (double standard Ralph)
4. **Code tasks**: `pnpm typecheck && pnpm test && pnpm lint` must pass
5. **Non-code tasks**: Self-verify against stated criteria
6. Exit conditions:
   - All scores = 10/10 → SUCCESS
   - Max iterations reached → report final state
   - Circuit breaker triggered → stop and document
7. Output `<promise>CHURLISH</promise>` when done

## Task Types

| Type | Verification |
|------|--------------|
| Code | Build + test + lint passes |
| Docs | Accuracy, completeness check |
| Specs | Feasibility, coverage check |
| Config | Applies without errors |
| Design | Meets requirements |
| Other | User-defined success criteria |

## State Machine
```
INIT → EXECUTE → SCORE → [LOOP | FINALIZE]
                   ↑          ↓
                   └──────────┘
```

## Default Criteria

| Criterion | Definition | 10/10 = |
|-----------|------------|---------|
| clarity | Zero ambiguity | Self-explanatory |
| completeness | All cases covered | Edge cases handled |
| correctness | No bugs/errors | Tests pass OR criteria met |

## Circuit Breaker
Auto-stop if:
- Same total score 3 iterations in a row
- Verification fails 3 iterations in a row
- No file changes in 2 iterations

## Workflow

### INIT
1. Parse task from user message
2. Detect task type (code/docs/specs/config/design/other)
3. Use default criteria unless specified
4. Create `.waaah/ralph/NNN-slug/progress.md`
5. Log: `## YOLO Mode — Iteration 1`

### EXECUTE

**For Code tasks:**
1. Write/update tests
2. Implement feature
3. Run: `pnpm typecheck && pnpm test && pnpm lint`
4. If failing → debug and fix (max 3 fix attempts per iteration)

**For Non-Code tasks:**
1. Draft/revise content
2. Self-review against criteria
3. Iterate until criteria appear met

Log changes to `progress.md`.

### SCORE
Rate each criterion 1-10.

```markdown
| Criterion | Score |
|-----------|-------|
| clarity | 8/10 |
| completeness | 7/10 |
| correctness | 10/10 |
```

Git commit: `git commit -m "ralph-yolo: iter N"`

Circuit breaker check:
- Compare to previous 2 iterations
- If identical total → trigger breaker

### LOOP (if any < 10 AND iter < max AND !breaker)
Focus on lowest score using standard strategies:

| Criterion | Strategy |
|-----------|----------|
| clarity | Simplify, add examples |
| completeness | Add missing parts |
| correctness | Fix errors |

→ EXECUTE

### FINALIZE

#### On Success (10/10/10)
```markdown
## ✅ YOLO COMPLETE

All criteria achieved 10/10.

<promise>CHURLISH</promise>
```

Git commit: `git commit -m "ralph-yolo: complete ✅"`

#### On Max Iterations
```markdown
## ⚠️ YOLO FINISHED (max iterations)

Final scores: X/X/X
Remaining gaps: [list]
```

#### On Circuit Breaker
```markdown
## 🛑 YOLO STOPPED (circuit breaker)

Reason: [same scores 3x | verification failing | no changes]
Last scores: X/X/X
Recommendation: [manual review needed]
```

## Usage

```
/ralph-yolo "Your task description here"

Optional flags (in task description):
--max-iter N           (default: 10)
--criteria "c1,c2,c3"  (default: clarity,completeness,correctness)
--type docs|specs|code (auto-detected if omitted)
```

## Examples

```
/ralph-yolo "Write comprehensive API docs for the task endpoints"

/ralph-yolo "Research best practices for WebSocket reconnection and summarize"

/ralph-yolo "Refactor the scheduler to use dependency injection --max-iter 15"

/ralph-yolo "Create a security audit checklist for the MCP server --criteria thoroughness,actionability,clarity"
```
