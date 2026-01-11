# Ralph 009: Fix Gemini Quota Handling

**Task:** Fix Gemini terminal UI spam when running as daemon (use `--output-format text`).

## Criteria

| Criterion | Score | Notes |
|-----------|-------|-------|
| robustness | - | Does it recover from quota errors? |
| automation | - | Does it avoid getting stuck in interactive prompts? |

## Process

| Iter | Focus | Scores |
|------|-------|--------|
| 0 | baseline | robustness:-, automation:- |
| 1 | fix-tui | robustness:10, automation:10 |

✅ COMPLETE
