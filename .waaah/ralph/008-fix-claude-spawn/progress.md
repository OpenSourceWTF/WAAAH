# Ralph 008: Fix Claude Spawning

**Task:** Fix `waaah agent --start claude` hanging by ensuring correct flags and MCP config.

## Criteria

| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | - | Is the spawning logic clear? |
| completeness | - | Are all necessary flags (`--dangerously`, `--mcp-config`) handled? |
| correctness | - | Does it actually spawn and connect? |

## Process

| Iter | Focus | Scores |
|------|-------|--------|
| 0 | baseline | clarity:-, completeness:-, correctness:- |
| 1 | fix-spawn | clarity:10, completeness:10, correctness:10 |

✅ COMPLETE
