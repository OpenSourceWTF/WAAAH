# Code Doctor Report #001: packages/

**Generated:** 2026-01-12T16:45:56-06:00
**Target:** packages/
**Status:** PENDING_REVIEW

---

## Summary

| Category | Count | Severity Score |
|----------|-------|----------------|
| REDUNDANT | 2 | 6 |
| COMPLEX | 7 | 14 |
| DEAD | 0 | 0 |
| PATTERN | 9 | 11 |
| **TOTAL** | **18** | **31** |

---

## Issues

### COMPLEX (7 issues)

Files exceeding 500 lines or cyclomatic complexity > 20.

#### C-001: ExpandedCardView.tsx is 647 lines (extract tab contents)
- **File:** `packages/admin-dashboard/src/components/kanban/ExpandedCardView.tsx:1`
- **Severity:** MEDIUM
- **Metric:** 647 lines, cyclomatic complexity 67
- **Description:** Monolithic component with 4 inline tabs. Tab content sizes:
  - `PROMPT` (lines 272-283): ~12 lines - simple, can stay inline
  - `TIMELINE` (lines 288-353): ~65 lines - complex IIFE rendering interleaved events
  - `REVIEW` (lines 356-374): ~18 lines - wraps DiffViewer
  - `CONTEXT` (lines 377-554): **~177 lines** - heavy editing state (`isEditingContext`, `editedWorkspace`, `editedCapabilities`), workspace forms, capability editor
- **Proposal:** Extract tab contents into separate components:
  1. `TimelineTab.tsx` - Move IIFE logic to dedicated component with proper types
  2. `ContextTab.tsx` - Extract all editing state and form logic (~177 lines → ~30 in parent)
  3. Keep PROMPT/REVIEW inline (they're simple wrappers)
  - Parent reduces from ~647 to ~300 lines
- **Status:** [x] DONE - Reduced to 385 lines

#### C-002: TaskCreationForm.tsx is 477 lines
- **File:** `packages/admin-dashboard/src/components/TaskCreationForm.tsx:1`
- **Severity:** MEDIUM
- **Metric:** 477 lines, cyclomatic complexity 45
- **Description:** Large form component with inline validation, multiple select inputs, and complex state management.
- **Proposal:** Extract: `FormValidation`, `CapabilitySelector`, `DependencySelector` hooks/components. Target ~150 lines.
- **Status:** [ ] PENDING

#### C-003: queue.ts is 427 lines with complexity 78
- **File:** `packages/mcp-server/src/state/queue.ts:1`
- **Severity:** MEDIUM
- **Metric:** 427 lines, cyclomatic complexity high (78 control flow statements)
- **Description:** Task queue manager does too much: task CRUD, agent reservation, dependency tracking, event emission.
- **Proposal:** Refactor into service classes: `TaskStateManager`, `AgentReservationService`, `DependencyResolver`. Use composition.
- **Status:** [ ] PENDING

#### C-004: agent-matcher.ts is 407 lines
- **File:** `packages/mcp-server/src/state/agent-matcher.ts:1`
- **Severity:** MEDIUM
- **Metric:** 407 lines, cyclomatic complexity 58
- **Description:** Agent matching logic mixes scoring, filtering, reservation, and waiting. Multi-concern file.
- **Proposal:** Extract: `AgentScoringService`, `ReservationService`. Each class single-responsibility.
- **Status:** [ ] PENDING

#### C-005: bot.ts is 404 lines
- **File:** `packages/bot/src/core/bot.ts:1`
- **Severity:** MEDIUM
- **Metric:** 404 lines, cyclomatic complexity 78
- **Description:** Bot core handles Discord commands, message parsing, task creation, and response formatting all inline.
- **Proposal:** Extract command handlers to separate files. Use command registry pattern.
- **Status:** [ ] PENDING

#### C-006: task-handlers.ts is 400 lines
- **File:** `packages/mcp-server/src/mcp/handlers/task-handlers.ts:1`
- **Severity:** MEDIUM
- **Metric:** 400 lines, cyclomatic complexity 75
- **Description:** MCP task handlers file contains all task-related operations. Many operations could be delegated.
- **Proposal:** Delegate business logic to existing `task-lifecycle-service.ts`. Handlers should be thin wrappers.
- **Status:** [ ] PENDING

#### C-007: Dashboard.tsx is 387 lines
- **File:** `packages/admin-dashboard/src/Dashboard.tsx:1`
- **Severity:** MEDIUM
- **Metric:** 387 lines, cyclomatic complexity 53
- **Description:** Main dashboard component with layout, routing, sidebar logic, modal management inline.
- **Proposal:** Extract: `DashboardLayout`, `SidebarContainer`, `ModalManager` components. Target ~150 lines.
- **Status:** [ ] PENDING

---

### PATTERN (8 issues)

Type safety violations, unsafe casts, and untyped error handling.

#### P-001: 9 usages of apiCall<any> without proper typing
- **File:** `packages/cli/src/` (multiple files)
- **Severity:** LOW
- **Description:** CLI commands use `apiCall<any>` instead of typed responses. Loses type safety benefits.
- **Proposal:** Define response types for each API endpoint. Replace `apiCall<any>` with `apiCall<AgentListResponse>` etc.
- **Affected Files:**
  - `interactive.ts:26,34,51`
  - `utils/event-listener.ts:23`
  - `commands/send.ts:32`
  - `commands/list.ts:8`
  - `commands/debug.ts:8`
  - `commands/answer.ts:11`
  - `commands/status.ts:17`
- **Status:** [x] DONE

#### P-002: 44+ usages of `as any` type assertions
- **File:** `packages/mcp-server/src/` (multiple files)
- **Severity:** LOW
- **Metric:** 44 instances
- **Description:** Database query results cast to `any` instead of proper row types. Defeats TypeScript benefits.
- **Proposal:** Define `DbRow` interface types for each table. Use `as TaskRow`, `as AgentRow` etc. Priority on persistence layer.
- **Affected Locations:**
  - `state/persistence/task-repository.ts` (8 instances)
  - `state/persistence/agent-repository.ts` (8 instances)
  - `state/persistence/queue-persistence.ts` (5 instances)
  - `state/event-log.ts` (3 instances)
  - `routes/admin-review.ts` (1 instance)
  - `routes/admin-tasks.ts` (2 instances)
  - `routes/sse-events.ts` (3 instances)
  - Others: 14 instances across handlers
- **Status:** [x] DONE - 22 instances in persistence layer

#### P-003: 30 catch blocks using `e: any` or untyped
- **File:** Multiple packages
- **Severity:** LOW
- **Description:** Error handling uses `catch (e: any)` or `catch (error)` without proper typing. Makes error handling less predictable.
- **Proposal:** Use `catch (e: unknown)` and type-narrow with `instanceof Error` or utility functions from `@waaah/types/errors`.
- **Affected Packages:**
  - `packages/cli/src/commands/` (10 instances)
  - `packages/mcp-server/src/routes/` (8 instances)
  - `packages/mcp-server/src/state/` (12 instances)
- **Status:** [ ] PENDING

#### P-004: 2 @ts-ignore directives suppressing type errors
- **File:** `packages/mcp-server/src/`
- **Severity:** LOW
- **Description:** TypeScript errors suppressed instead of fixed.
- **Proposal:** Fix underlying type issues and remove `@ts-ignore`.
- **Locations:**
  - `routes/admin-tasks.ts:67` - Fix 'from' type in shared types
  - `mcp/handlers/task-handlers.ts:189` - Add proper array type guard
- **Status:** [ ] PENDING

#### P-005: let config: any in agent-utils.ts
- **File:** `packages/cli/src/utils/agent-utils.ts:142`
- **Severity:** LOW
- **Description:** Configuration object declared as `any`, losing type safety.
- **Proposal:** Define `McpConfig` interface and use typed configuration.
- **Status:** [x] DONE

#### P-006: server.ts uses `let server: any`
- **File:** `packages/mcp-server/src/server.ts:134`
- **Severity:** LOW
- **Description:** HTTP server declared as `any` type.
- **Proposal:** Use `http.Server` type import from Node.js.
- **Status:** [x] DONE

#### P-007: Slack adapter uses multiple `as any` casts
- **File:** `packages/bot/src/adapters/slack.ts:35,91,112`
- **Severity:** LOW
- **Description:** Slack event handling uses unsafe type assertions.
- **Proposal:** Define proper Slack event types or use `@slack/bolt` type definitions.
- **Status:** [ ] PENDING

#### P-008: toolRouter uses (method as any).call
- **File:** `packages/mcp-server/src/routes/toolRouter.ts:55-56`
- **Severity:** LOW
- **Description:** Dynamic method invocation bypasses TypeScript checks.
- **Proposal:** Create typed method dispatcher with proper function signatures.
- **Status:** [ ] PENDING

#### P-009: CLI and Bot lack plugin architecture
- **File:** `packages/cli/src/index.ts` and `packages/bot/src/core/bot.ts`
- **Severity:** MEDIUM
- **Description:** 
  - **CLI:** 11 commands hardcoded in `index.ts` with manual imports and `program.addCommand()` calls. Adding a command requires modifying the entry point.
  - **Bot:** 8 command handlers (`handleMessage`, `handleStatusCommand`, `handleAnswerCommand`, etc.) inline in 404-line `BotCore` class. No extensibility.
- **Proposal:**
  1. **CLI Plugin Model:**
     ```typescript
     // commands/index.ts - auto-discover
     const commandFiles = glob.sync('./commands/*.ts');
     for (const file of commandFiles) {
       const { default: cmd } = await import(file);
       if (cmd instanceof Command) program.addCommand(cmd);
     }
     ```
  2. **Bot Command Registry:**
     ```typescript
     interface BotCommand {
       name: string;
       pattern: RegExp;
       execute(content: string, ctx: MessageContext): Promise<void>;
     }
     // Load from commands/*.ts, register dynamically
     ```
  - Benefits: Add commands without modifying core files, easier testing, extension points for user plugins.
- **Status:** [ ] PENDING

---

### REDUNDANT (2 issues)

Duplicate or repetitive code patterns.

#### R-001: apiFetch vs apiCall - Two HTTP fetch utilities
- **File:** `packages/admin-dashboard/src/lib/api.ts:15` and `packages/cli/src/utils/api.ts:49`
- **Severity:** HIGH
- **Description:** Two separate implementations of API fetching logic. Dashboard uses `apiFetch`, CLI uses `apiCall`. Both do similar work with slight variations.
- **Proposal:** Consolidate into `@waaah/types` or create shared `@waaah/api-client` package. Both apps import from single source.
- **Status:** [ ] PENDING

#### R-002: Repeated error handling boilerplate in CLI commands
- **File:** `packages/cli/src/commands/` (10 files)
- **Severity:** HIGH
- **Description:** Each command file has identical try/catch pattern with `console.error` and `process.exit(1)`. ~15 lines duplicated per file.
- **Proposal:** Create `withErrorHandling(fn)` wrapper utility. Each command exports unwrapped function, entry point wraps.
- **Pattern Found:**
  ```typescript
  try {
    // command logic
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  ```
- **Status:** [x] DONE - handleError utility already exists

---

## Implementation Plan

Proposed order (highest severity + impact first):

### Phase 1: Quick Wins (LOW effort, HIGH value)
1. [ ] R-002: Extract CLI error handling wrapper
2. [ ] P-004: Remove @ts-ignore (fix underlying types)
3. [ ] P-005: Type `config` in agent-utils.ts
4. [ ] P-006: Type `server` in server.ts

### Phase 2: Type Safety (MEDIUM effort, HIGH value)
5. [ ] P-001: Add types to all `apiCall<any>` usages in CLI
6. [ ] P-002: Add DB row types to persistence layer (priority)
7. [ ] P-003: Fix catch blocks with `unknown` + type narrowing

### Phase 3: Complexity Reduction (HIGH effort, MEDIUM value)
8. [ ] C-001: Refactor ExpandedCardView.tsx → extract sub-components
9. [ ] C-002: Refactor TaskCreationForm.tsx → extract logic
10. [ ] C-007: Refactor Dashboard.tsx → extract layout/modals

### Phase 4: Architecture (HIGH effort, HIGH value)
11. [ ] R-001: Consolidate apiFetch/apiCall into shared package
12. [ ] C-003: Refactor queue.ts → service classes
13. [ ] C-004: Refactor agent-matcher.ts → single-responsibility services
14. [ ] P-009: Implement CLI plugin auto-discovery + Bot command registry

### Deferred (Optional)
14. [ ] C-005: Refactor bot.ts → command registry
15. [ ] C-006: Thin out task-handlers.ts
16. [ ] P-007: Type Slack adapter properly
17. [ ] P-008: Type toolRouter dispatcher

---

## Notes

- **DEAD code scan:** No orphan files or unused exports detected. The codebase is actively used.
- **Test coverage:** Not analyzed in this report (separate concern for test-writing capability).
- **Estimated total effort:** ~8-12 hours for full implementation.
