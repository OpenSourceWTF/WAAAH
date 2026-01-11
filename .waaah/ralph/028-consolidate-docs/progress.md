# Ralph 028: Consolidate Documentation

## YOLO Mode 🚀

**Task**: Condense and consolidate docs/*, root architectural files, and incorporate new .waaah/specs
**Criteria**: succinct, clear, complete

---

## Iteration 1

### Discovery

**Root docs (keep/update):**
| File | Lines | Status | Action |
|------|-------|--------|--------|
| README.md | 389 | Current | Update links |
| ARCHITECTURE.md | 205 | V7/Current | Keep as canonical |
| ACCEPTANCE.md | 158 | Outdated (bot threading) | DELETE or archive |
| CONTRIBUTING.md | ? | Current | Keep |
| waaah-spec-critique.md | ? | Internal | DELETE or archive |

**docs/ folder:**
| File | Lines | Status | Action |
|------|-------|--------|--------|
| PROPOSAL.md | 368 | V2/Outdated | DELETE or archive |
| ARCHITECTURE_OVERVIEW.md | 42 | Redundant | DELETE (merge into ARCHITECTURE.md) |
| MASTER_ARCHITECTURE.md (specs/v7) | 161 | V5/Outdated | DELETE (superseded) |
| CLI_REFERENCE.md | ~100 | Current | Keep |
| MCP_INTEGRATION.md | ~200 | Current | Keep |
| ANTIGRAVITY_SETUP.md | ~100 | Current | Keep |
| API_REFERENCE.md | ~60 | Current | Keep |
| SCHEMA_SYNC.md | ~80 | Current | Keep |

**docs/specs/v7/ (22 files):**
- Individual feature specs (01-19)
- Should be archived or consolidated into ARCHITECTURE.md appendix

**.waaah/specs/ (8 new specs to incorporate):**
| Spec | Description | Incorporate into |
|------|-------------|------------------|
| 001-cli-agent-wrapper | Agent CLI wrapper | ARCHITECTURE.md §Agents |
| 002-waaah-doctor | Doctor agent | ARCHITECTURE.md §Agents |
| 003-data-layer-websocket | WebSocket/SSE events | ARCHITECTURE.md §Real-time |
| 004-agent-scheduling-overhaul | Scheduler improvements | ARCHITECTURE.md §Scheduler |
| 005-orc-reliability | Orchestrator reliability | ARCHITECTURE.md §Workflows |
| 006-ui-spec-submission | UI spec form | docs/CLI_REFERENCE.md |
| 007-rbac-github-sso | RBAC (future) | Skip (not implemented) |
| 008-mcp-tool-optimization | MCP response format | ARCHITECTURE.md §MCP |

---

### Plan

**Phase 1: Cleanup (delete redundant)**
1. Delete `ACCEPTANCE.md` (outdated, task-specific)
2. Delete `docs/PROPOSAL.md` (V2, historical)
3. Delete `docs/ARCHITECTURE_OVERVIEW.md` (redundant)
4. Delete `waaah-spec-critique.md` (internal)
5. Archive `docs/specs/v7/MASTER_ARCHITECTURE.md` → `docs/archive/`

**Phase 2: Consolidate ARCHITECTURE.md**
- Add §5: Real-time Updates (WebSocket/SSE from spec 003)
- Add §6: Agent CLI Wrapper (from spec 001)
- Update §3.2: Scheduler with dependency scoring (spec 004)
- Add §7: MCP Tool Response Format (spec 008)
- Add §8: Orchestrator Loop (spec 005)

**Phase 3: Update README.md**
- Remove broken/outdated links
- Ensure architecture diagram matches ARCHITECTURE.md
- Add link to new .waaah/specs for latest features

**Success Criteria:**
- [ ] No redundant architecture docs
- [ ] ARCHITECTURE.md is single source of truth
- [ ] All implemented .waaah/specs reflected
- [ ] README links work

---

## Goal
**Type**: Docs
**Criteria**: succinct, clear, complete

| Criterion | Definition | 10/10 = |
|-----------|------------|---------|
| succinct | No redundancy, minimal words | One doc per concept |
| clear | Easy to understand | Newcomer can navigate |
---

## Iteration 1 — EXECUTE

### Changes Made

**Phase 1: Cleanup**
- ✅ `ACCEPTANCE.md` → `docs/archive/`
- ✅ `docs/PROPOSAL.md` → `docs/archive/`
- ✅ `docs/ARCHITECTURE_OVERVIEW.md` → `docs/archive/`
- ✅ `docs/specs/v7/MASTER_ARCHITECTURE.md` → `docs/archive/`
- ✅ `waaah-spec-critique.md` → `docs/archive/`

**Phase 2: ARCHITECTURE.md Updates**
- ✅ §5 Real-Time Events (Socket.io) — from spec 003
- ✅ §6 Agent CLI Wrapper — from spec 001
- ✅ §7 Scheduler Scoring — from spec 004
- ✅ §8 MCP Response Format — from spec 008
- ✅ §9 Worktree Reliability — from spec 005

**Phase 3: README.md**
- ✅ Verified no broken links to archived files

**Commit:** `fe31375`

### Iteration 1 Scores

| Criterion | Score | Justification |
|-----------|-------|---------------|
| succinct | 8/10 | Removed 5 redundant files, but docs/specs/v7 still has 20+ small specs |
| clear | 9/10 | ARCHITECTURE.md now has logical flow with 9 sections |
| complete | 8/10 | 5/8 .waaah/specs incorporated; 002/006/007 not added |

**Total: 25/30 (8.3 avg)**

---

## Iteration 2 — EXECUTE (focus: completeness)

Gaps to fix:
1. Add spec 002 (waaah-doctor) to docs
2. Add spec 006 (UI spec submission) to CLI_REFERENCE.md
3. Consider archiving docs/specs/v7 individual files (redundant with ARCHITECTURE.md)

