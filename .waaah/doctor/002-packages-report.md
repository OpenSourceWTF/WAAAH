# Code Doctor Report #002: packages/

**Generated:** 2026-01-13
**Target:** packages/
**Status:** PENDING_REVIEW

## Summary

| Category | Count | Severity Score |
|----------|-------|----------------|
| COMPLEX | 2 | 4 |
| PATTERN | 4 | 4 |
| DEAD | 2 | 6 |
| COVERAGE | 4 | 12 |
| **TOTAL** | **12** | **26** |

## Issues

### COMPLEX (2 issues)

#### C-001: Large Test File (queue.test.ts)
- **File:** `packages/mcp-server/tests/queue.test.ts:1`
- **Severity:** MEDIUM
- **Metric:** 591 lines
- **Description:** File exceeds 500 lines. Large test files are hard to maintain.
- **Proposal:** Split into `queue-enqueue.test.ts`, `queue-lifecycle.test.ts`, etc.
- **Status:** [ ] PENDING

#### C-002: Large Test File (handlers.test.ts)
- **File:** `packages/mcp-server/tests/handlers.test.ts:1`
- **Severity:** MEDIUM
- **Metric:** 540 lines
- **Description:** File exceeds 500 lines.
- **Proposal:** Split into `handlers-task.test.ts`, `handlers-agent.test.ts`.
- **Status:** [ ] PENDING

### PATTERN (4 issues)

#### P-001: Explicit `any` usage in Dashboard
- **File:** `packages/admin-dashboard/src/Dashboard.tsx:10` (approx)
- **Severity:** LOW
- **Description:** explicit `any` type bypasses type safety.
- **Proposal:** Replace `any` with specific interface or `unknown`.
- **Status:** [ ] PENDING

#### P-002: `as any` in Bot Adapter
- **File:** `packages/bot/src/adapters/embed-formatter.ts:10` (approx)
- **Severity:** LOW
- **Description:** Unsafe type assertion.
- **Proposal:** Define proper Embed type or interface.
- **Status:** [ ] PENDING

#### P-003: `console.log` in CLI
- **File:** `packages/cli/src/interactive.ts:10`
- **Severity:** LOW
- **Description:** Production code using `console.log` instead of Logger.
- **Proposal:** Replace with `logger.info()` or `process.stdout` if intentional CLI output.
- **Status:** [ ] PENDING

#### P-004: `any` in Socket Type
- **File:** `packages/admin-dashboard/src/lib/socket.ts:1`
- **Severity:** LOW
- **Description:** `(data: { tasks: any[] })` usage.
- **Proposal:** Import `Task` type from types package.
- **Status:** [ ] PENDING

### DEAD (2 issues)

#### D-001: Empty Index (mcp/index.ts)
- **File:** `packages/mcp-server/src/mcp/index.ts:1`
- **Severity:** HIGH
- **Description:** 0% coverage, likely empty or unused barrel file.
- **Proposal:** Verify if needed, otherwise delete.
- **Status:** [ ] PENDING

#### D-002: Empty Handlers Index
- **File:** `packages/mcp-server/src/mcp/handlers/index.ts:1`
- **Severity:** HIGH
- **Description:** 0% coverage.
- **Proposal:** Verify if needed, otherwise delete.
- **Status:** [ ] PENDING

### COVERAGE (4 issues)

#### COV-001: Low Bot Coverage
- **File:** `packages/bot`
- **Severity:** HIGH
- **Metric:** 51% Stmts
- **Description:** Bot package has very low test coverage.
- **Proposal:** Add tests for `base-adapter.ts` and `bot.ts`.
- **Status:** [ ] PENDING

#### COV-002: Low SSE Events Coverage
- **File:** `packages/mcp-server/src/mcp/sse-events.ts`
- **Severity:** HIGH
- **Metric:** 15.9% Stmts
- **Description:** Critical infrastructure code is mostly untested.
- **Proposal:** Add unit tests for `sse-events.ts`.
- **Status:** [ ] PENDING

#### COV-003: Low MCP Client Coverage
- **File:** `packages/mcp-server/src/services/mcp-client-service.ts`
- **Severity:** HIGH
- **Metric:** 35% Stmts
- **Description:** MCP Client logic has low coverage.
- **Proposal:** Add tests mocking the MCP connection.
- **Status:** [ ] PENDING

#### COV-004: Low ToastProvider Coverage
- **File:** `packages/admin-dashboard/src/components/ui/ToastProvider.tsx`
- **Severity:** HIGH
- **Metric:** 35% Stmts
- **Description:** UI Component logic not fully tested.
- **Proposal:** Add component tests.
- **Status:** [ ] PENDING

## Implementation Plan

Proposed order (highest severity first):
1. [ ] D-001: Verify/Delete `packages/mcp-server/src/mcp/index.ts`
2. [ ] D-002: Verify/Delete `packages/mcp-server/src/mcp/handlers/index.ts`
3. [ ] COV-002: Test `sse-events.ts`
4. [ ] COV-003: Test `mcp-client-service.ts`
5. [ ] C-001: Split `queue.test.ts`
6. [ ] C-002: Split `handlers.test.ts`
7. [ ] P-001: Fix `any` in Dashboard
8. [ ] P-003: Fix `console.log` in CLI
