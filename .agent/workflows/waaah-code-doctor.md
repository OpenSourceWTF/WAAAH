---
name: waaah-code-doctor
description: Analyze, report, refine, and fix code quality issues - autonomous after approval
---

# Code Doctor 🩺

**Diagnose → Report → Approve → Autonomous Implement.**

## State Machine

```
SCAN → REPORT → FEEDBACK → [REFINE | IMPLEMENT → VERIFY → DONE]
  ↑               ↓                    ↓ (autonomous)
  └───────────────┘                    └──────────────┘
```

## Phases

| Phase | Description | Exit Condition |
|-------|-------------|----------------|
| SCAN | Exhaustive analysis of target scope | All checks complete |
| REPORT | Generate `.waaah/doctor/NNN-slug-report.md` | Report written |
| FEEDBACK | Present report, await user input | User responds |
| REFINE | Update report per feedback | User approves |
| IMPLEMENT | Apply fixes per approved report | All items fixed |
| VERIFY | `pnpm build && pnpm test` passes | Build + tests green |

---

## Rules

| # | Rule |
|---|------|
| 1 | MUST complete ALL analysis before generating report |
| 2 | MUST NOT implement changes until user approves report |
| 3 | MUST log every issue with file, line, category, severity |
| 4 | MUST provide concrete fix proposal for each issue |
| 5 | MUST verify `pnpm build && pnpm test` after implementation |
| 6 | MUST NOT claim "done" without evidence |

---

## Issue Categories

| Category | Detection Pattern | Severity |
|----------|-------------------|----------|
| REDUNDANT | Duplicate functions, copy-paste blocks, repeated logic | HIGH |
| COMPLEX | Cyclomatic > 20, nested depth > 4, file > 500 lines | MEDIUM |
| DEAD | Unreachable code, unused exports, orphan files | HIGH |
| PATTERN | Missing error handling, no types, hardcoded values | LOW |
| DOCS | Missing JSDoc, outdated comments, no README | MEDIUM |
| COVERAGE | Uncovered files, low branch coverage, missing tests | HIGH |
| SPEC | Spec scenarios not implemented, edge cases missing | HIGH |

## Severity Weights

| Severity | Weight | Action |
|----------|--------|--------|
| HIGH | 3 | Must fix |
| MEDIUM | 2 | Should fix |
| LOW | 1 | Consider fix |

---

## Phase Definitions

### SCAN

```
1. PARSE target scope from user (path, glob, or "all")
   DEFAULT: "packages/" | FALLBACK: entire repo

2. FOR category IN [REDUNDANT, COMPLEX, DEAD, PATTERN]:
   RUN exhaustive search
   RECORD: { file, line, category, description, proposal }

3. SORT issues BY severity DESC, file ASC

4. COMPUTE statistics:
   - total_issues
   - issues_by_category
   - issues_by_severity
   - estimated_effort (sum of severity weights)
```

### Detection Commands

| Category | Command / Analysis |
|----------|-------------------|
| REDUNDANT | Token similarity analysis, AST-based clone detection, grep identical blocks |
| COMPLEX | `grep -cE "(if|for|while|switch|case|\?\.|&&|\|\|)"`, nesting depth via AST |
| DEAD | `tsc --noEmit` unused exports, `grep -rL "import.*from.*FILE"` |
| PATTERN | `grep -rE "TODO|FIXME|any|as any|catch\s*\(\s*\)"`, config hardcodes |
| DOCS | `grep -rL "@param\|@returns" "*.ts"`, missing README in packages, stale comments |
| COVERAGE | `pnpm test --coverage`, parse statement/branch percentages |
| SPEC | Scan `.waaah/specs/`, compare scenarios to codebase, find missing implementations |

### REPORT

```
1. GENERATE report number:
   NNN = MAX(existing .waaah/doctor/*-report.md) + 1 | 001

2. GENERATE slug from target scope (sanitized, max 30 chars)

3. WRITE .waaah/doctor/{NNN}-{slug}-report.md:
```

### Report Template

```markdown
# Code Doctor Report #{NNN}: {scope}

**Generated:** {timestamp}
**Target:** {scope}
**Status:** PENDING_REVIEW

## Summary

| Category | Count | Severity Score |
|----------|-------|----------------|
| REDUNDANT | N | X |
| COMPLEX | N | X |
| DEAD | N | X |
| PATTERN | N | X |
| **TOTAL** | **N** | **X** |

## Issues

### REDUNDANT (N issues)

#### R-001: {short description}
- **File:** `{path}:{line}`
- **Severity:** HIGH
- **Description:** {what is redundant and why}
- **Proposal:** {concrete fix steps}
- **Status:** [ ] PENDING

### COMPLEX (N issues)

#### C-001: {short description}
- **File:** `{path}:{line}`
- **Severity:** MEDIUM
- **Metric:** {complexity score or line count}
- **Description:** {why it's too complex}
- **Proposal:** {refactoring strategy}
- **Status:** [ ] PENDING

### DEAD (N issues)

#### D-001: {short description}
- **File:** `{path}:{line}`
- **Severity:** HIGH
- **Description:** {why it's dead}
- **Proposal:** {delete or reference fix}
- **Status:** [ ] PENDING

### PATTERN (N issues)

#### P-001: {short description}
- **File:** `{path}:{line}`
- **Severity:** LOW
- **Description:** {pattern violation}
- **Proposal:** {best practice fix}
- **Status:** [ ] PENDING

### DOCS (N issues)

#### DOC-001: {short description}
- **File:** `{path}:{line}`
- **Severity:** MEDIUM
- **Description:** {missing documentation or outdated comment}
- **Proposal:** {add JSDoc, update comment, create README}
- **Status:** [ ] PENDING

### COVERAGE (N issues)

#### COV-001: {short description}
- **File:** `{path}`
- **Severity:** HIGH
- **Metric:** {stmt% / branch%}
- **Description:** {file below 90% stmt or 85% branch}
- **Proposal:** {add tests for uncovered lines}
- **Status:** [ ] PENDING

## Implementation Plan

Proposed order (highest severity first):
1. [ ] R-001: {short}
2. [ ] D-001: {short}
3. [ ] C-001: {short}
...
```

### FEEDBACK

```
1. PRESENT report via notify_user:
   PathsToReview: [report_path]
   BlockedOnUser: true
   Message: "Code Doctor analyzed {scope}. Found {N} issues. Review report and provide feedback."

2. AWAIT user response

3. IF user says "approved" | "looks good" | "implement" → IMPLEMENT
   IF user provides changes → REFINE
   IF user says "cancel" | "abort" → EXIT
```

### REFINE

```
1. PARSE user feedback for:
   - Issue removals (false positives)
   - Priority changes
   - Scope additions/reductions
   - Proposal modifications

2. UPDATE report in-place:
   - Mark removed issues as [WONTFIX]
   - Update severity/priority as directed
   - Add new issues if scope expanded
   - Update proposals per feedback

3. INCREMENT report revision (append "## Revision N" section)

4. → FEEDBACK (loop until approved)
```

### IMPLEMENT

> [!IMPORTANT]
> **AUTONOMOUS MODE** - Once user approves, run to completion without pausing.
> DO NOT call `notify_user` until ALL issues are fixed and verified.

```
1. SORT approved issues BY:
   - severity DESC
   - dependencies (fix dependencies first)

2. FOR issue IN approved_issues:
   a. APPLY fix per proposal
   b. UPDATE report: Status → [x] DONE
   c. RUN `pnpm build`
   d. IF build fails → FIX error → retry (max 3)
   e. git commit -m "code-doctor: {issue_id} - {short}"
   f. LOG progress to console (no notify_user)

3. → VERIFY (immediately, no pause)
```

### VERIFY

```
1. RUN `pnpm build && pnpm test`

2. IF fails:
   - DIAGNOSE failure
   - FIX (max 3 attempts per issue)
   - RETRY

3. SCORE implementation:
```

| Criterion | 10/10 Definition | Evidence Required |
|-----------|------------------|-------------------|
| completeness | All approved issues fixed | Report shows all [x] |
| correctness | Build + tests pass | `pnpm build && pnpm test` output |
| stability | No regressions | Test count unchanged or increased |

```
4. IF all 10/10 → DONE
   IF any < 10 → LOOP (fix gaps)
```

### DONE

```
1. UPDATE report header: Status → COMPLETED

2. APPEND to report:
   ## Completion Summary
   - Issues fixed: N/M
   - Build: ✅/❌
   - Tests: ✅/❌ (X passing, Y skipped, Z failed)
   - Commits: [list]

3. notify_user:
   Message: "Code Doctor complete. {N} issues fixed. Report updated."
   PathsToReview: [report_path]
   BlockedOnUser: false
```

---

## Quality Gates

| Gate | Criteria | On Fail |
|------|----------|---------|
| SCAN_COMPLETE | All 6 categories analyzed | Re-scan missed categories |
| REPORT_VALID | All issues have: file, line, category, severity, proposal | Fill missing fields |
| USER_APPROVED | User explicitly approves | Loop FEEDBACK → REFINE |
| BUILD_PASSES | `pnpm build` exits 0 | Fix errors |
| TESTS_PASS | `pnpm test` exits 0 | Fix tests |
| COVERAGE_STMT | Statement coverage ≥ 90% | Add tests for uncovered lines |
| COVERAGE_BRANCH | Branch coverage ≥ 85% | Add tests for untested branches |
| ALL_FIXED | No [PENDING] issues remain | Continue IMPLEMENT |

## Coverage Thresholds

| Metric | Threshold | Command |
|--------|-----------|---------|
| Statement | ≥ 90% | `pnpm test --coverage` |
| Branch | ≥ 85% | Parse coverage output |
| Function | ≥ 85% | Optional, report only |

**IF coverage below threshold:**
1. IDENTIFY uncovered files
2. GENERATE COV-NNN issues for each
3. INCLUDE in report with proposal

---

## Circuit Breaker

STOP IF:
- Build fails 5x consecutively → report partial progress
- Same issue fails fix 3x → mark [BLOCKED], continue others
- User provides no feedback after 3 prompts → EXIT with current state

---

## Usage

```
/code-doctor packages/mcp-server
/code-doctor src/
/code-doctor --scope "**/*.ts" --exclude "**/tests/**"
/code-doctor --category REDUNDANT,COMPLEX
```

## Examples

```
/code-doctor packages/types
# Analyzes packages/types for all issue categories

/code-doctor packages/ --category DEAD
# Finds only dead code in packages/

/code-doctor --scope "packages/mcp-server/src/**/*.ts"
# Targeted analysis with glob pattern
```
