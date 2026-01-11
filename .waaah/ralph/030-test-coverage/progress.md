# Ralph YOLO — Comprehensive Test Coverage

**Session ID:** 030-test-coverage
**Mode:** YOLO (autonomous)
**Target:** 95% statement coverage, 85% branch coverage across all packages

## Task Type: Code

## Criteria
| Criterion | Definition | 10/10 = |
|-----------|------------|---------|
| coverage | Test coverage metrics | 95% stmt, 85% branch |
| passing | All tests pass | `pnpm test` exits 0 |
| quality | Tests are sandboxed, maintainable | Proper mocks, cleanup |

## Discovery

### Current State
```
packages/
├── bot/          # 2 FAILING tests
├── cli/          # 36 passing, 100% adapters coverage ✅
├── cli-wrapper/  # Tests exist
├── mcp-server/   # Core package - needs audit
├── types/        # 43 passing ✅
```

### Failing Tests (bot package)
1. `initializes adapter and connects` — mock fs issue
2. `enqueues task when target agent is specified` — mock axios issue

## Plan

### Phase 1: Fix Failing Tests (bot)
- [ ] Fix bot.test.ts mock setup

### Phase 2: Package-by-Package Coverage
- [ ] bot: Get to 95%/85%
- [ ] cli-wrapper: Get to 95%/85%
- [ ] mcp-server: Get to 95%/85%
- [ ] mcp-server/client: Get to 95%/85%

---

## Iteration 1 — EXECUTE

### Changes Made
- ✅ Fixed `bot.test.ts` — removed obsolete fs/yaml mocks, added axios.get mock for dynamic aliases
- ✅ Added 3 new bot tests (update cmd, answer cmd, graceful error handling)
- ✅ Bot: 19/19 tests passing

### Coverage Audit

| Package | Statements | Branch | Status |
|---------|------------|--------|--------|
| bot | 51% | 35% | ❌ Needs work |
| cli | 100% (adapters) | 84% | ✅ Good |
| cli-wrapper | ~70% | ~50% | ⚠️ node-pty native issue |
| mcp-server | ~50% | ~40% | ❌ Needs work |
| types | 100% | ~90% | ✅ Good |

### Top Gaps (mcp-server)
| File | Coverage | Impact |
|------|----------|--------|
| routes/*.ts | 27% | High |
| handlers/*.ts | 42% | High |
| eventbus.ts | 31% | High |
| agent-matcher.ts | 28% | Medium |

### Git Commit
```
ralph-yolo: iter 1 - fix bot tests
```

### Iteration 1 Scores

| Criterion | Score | Justification |
|-----------|-------|---------------|
| coverage | 3/10 | Still far from 95%/85% target |
| passing | 8/10 | Bot fixed (19/19), cli-wrapper has native dep issue |
| quality | 7/10 | Bot tests properly sandboxed |

**Total: 18/30 (6.0 avg)**

⏳ Continuing...
