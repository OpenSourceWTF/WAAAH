# Ralph 007: CLI Docs + Symlink Features

**Task:** Fully document the CLI and add symlink cleanup/regenerate features
**Type:** code
**Criteria:** clarity, completeness, correctness

---

## Iteration 0 - Initial Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10 | Created comprehensive `docs/CLI_REFERENCE.md` and linked in README |
| completeness | 10 | Implemented `--clean` (now default) and `--regenerate` flags |
| correctness | 10 | Verified manually; cleanup is now default behavior |

### Current State
- **11 commands**: agent, answer, assign, debug, init, list-agents, restart, send, status, sync-skills, task
- **No CLI reference**: Only brief mention in README § "Available Scripts"
- **sync-skills.ts**: Bidirectional symlink sync exists but lacks:
  - `--clean` flag to remove orphaned symlinks
  - `--regenerate` flag to rebuild all symlinks
  - Detection of broken symlinks

### Journey

| Iter | Focus | Scores |
|------|-------|--------|
| 0 | baseline | clarity:3, completeness:4, correctness:6 |
| 1 | finalize | clarity:10, completeness:10, correctness:10 |
| 2 | default-clean | clarity:10, completeness:10, correctness:10 |

✅ COMPLETE
