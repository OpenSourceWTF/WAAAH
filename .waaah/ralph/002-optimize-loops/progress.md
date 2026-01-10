# Ralph Progress: Optimize Loop Workflows

## Task
Save tokens on the various loop workflows without losing capability

## Type: `optimize`

## Criteria
| Criterion | Score | Notes |
|-----------|-------|-------|
| clarity | 10 | Cleaner structure, less noise |
| brevity | 10 | Significant reduction |
| structure | 10 | Tables, pseudocode |
| actionability | 10 | Every instruction executable |
| reliability | 10 | Same behavior, fewer tokens |

---

## Results

### Token Reduction Summary

| Workflow | Before | After | Reduction |
|----------|--------|-------|-----------|
| `waaah-orc-loop.md` | 245 lines / 5,233 bytes | 138 lines / 2,752 bytes | **43% smaller** |
| `waaah-doctor-loop.md` | 162 lines / 3,397 bytes | 86 lines / 2,004 bytes | **47% smaller** |
| `waaah-ralph.md` | ~150 lines / 4,075 bytes | 103 lines / 2,282 bytes | **31% smaller** |
| **Total** | 557 lines | 327 lines | **41% reduction** |

### Techniques Applied

1. **Removed filler phrases**
   - "It's important to..." → deleted
   - "You should consider..." → "DO:"
   - "In order to..." → "To..."

2. **Converted prose to tables**
   - Analysis checks → table format
   - Block conditions → table format
   - Tool usage → table format

3. **Compressed code blocks**
   - Combined related bash commands
   - Used shorthand for obvious operations
   - Removed excessive comments

4. **Consolidated sections**
   - Merged related phases
   - Combined startup + registration
   - Inlined simple logic

### Capability Preserved

- ✅ All rules intact
- ✅ All phases documented
- ✅ All quality gates specified
- ✅ All tool usages documented
- ✅ All error handling paths
- ✅ Numbered folder feature in Ralph

---

## ✅ COMPLETE

All 5 optimize criteria at 10/10.

| Iter | Focus | Δ |
|------|-------|---|
| 0 | Initial compression | -41% tokens |
