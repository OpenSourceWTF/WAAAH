# Dashboard UX Polish Specification
**Version:** 1.0 | **Status:** Ready
**Depends On:** None
**Related Workflows:** `/frontend-design`

## 1. Overview
**Problem:** The admin dashboard lacks usability controls for prompt engineers orchestrating agents in a kanban flow.  
**Users:** Prompt engineers managing autonomous agent tasks.  
**Solution:** Add task controls, capability editing, visual theming, and layout optimizations.

## 2. Integration Path
**UI:** Dashboard → KanbanBoard → ExpandedCardView → Action Buttons + Forms  
**API:** Existing `/admin/tasks/:id/cancel` repurposed, new `/admin/capabilities` endpoint  

## 3. User Stories
- [ ] US-1: As a prompt engineer, I want a BLOCKED column so tasks awaiting my input are visible
- [ ] US-2: As a prompt engineer, I want to permanently delete tasks with a confirmation dialog
- [ ] US-3: As a prompt engineer, I want to add/edit capabilities using a chip input with suggestions
- [ ] US-4: As a prompt engineer, I want a cozy light theme with warm cream tones
- [ ] US-5: As a prompt engineer, I want a deeper midnight charcoal dark theme
- [ ] US-6: As a prompt engineer, I want reduced vertical padding in expanded task views

## 4. Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | Add BLOCKED column to Kanban for tasks with `status=BLOCKED` (user-input-blocked) |
| FR-2 | Repurpose Cancel → permanent delete with confirm dialog: "Delete permanently? Cannot be undone." |
| FR-3 | Add ChipInput component for capabilities with autocomplete suggestions |
| FR-4 | Fetch capability suggestions from `/admin/capabilities`, fallback to hardcoded defaults |
| FR-5 | Hardcoded defaults: `code-writing`, `test-writing`, `doc-writing`, `spec-writing`, `code-doctor` |
| FR-6 | ChipInput allows custom strings (user types, confirms, becomes deletable pill) |
| NFR-1 | Light theme: warm cream/off-white background, cozy aesthetic |
| NFR-2 | Dark theme: deeper charcoal with neutral undertones (no blue tint) |
| NFR-3 | WAAAH theme: unchanged (brutalist green monochrome) |
| NFR-4 | Reduce top/bottom padding in ExpandedCardView while preserving horizontal padding |

## 5. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Delete last task | Show confirm, delete, column becomes empty (normal empty state) |
| Empty capability input | Allow task creation with no capabilities (existing behavior) |
| Backend `/capabilities` fails | Fall back to hardcoded list, no error shown |
| Chip duplicate entered | Prevent duplicate, flash existing chip |
| Delete in-flight task (PROCESSING) | Show warning in confirm: "Task is currently processing" |

## 6. Out of Scope
- Workspace editing (remains read-only)
- Dependency-blocked tasks (future: separate "WAITING" status)
- Bulk delete actions
- Undo/archive flow (delete is permanent)

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| BLOCKED column visible | Tasks with BLOCKED status appear |
| Delete flow works | Confirm → task removed from DB and UI |
| ChipInput functional | Add/remove chips, autocomplete works |
| Theme switch smooth | No flash, CSS variables apply instantly |

## 8. Implementation Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **Kanban: Add BLOCKED column** | S | — | `grep -r "BLOCKED" KanbanBoard.tsx` |
| T2 | **ExpandedCardView: Repurpose Cancel → Delete with confirm** | S | — | Manual: click Cancel, see confirm |
| T3 | **ChipInput: Create reusable component** | M | — | `pnpm test -- ChipInput` |
| T4 | **API: Add GET /admin/capabilities endpoint** | S | — | `curl localhost:3000/admin/capabilities` |
| T5 | **TaskCreationForm: Integrate ChipInput for capabilities** | M | T3,T4 | Manual: create task with chips |
| T6 | **ExpandedCardView: Add capabilities editing via ChipInput** | M | T3,T4 | Manual: edit task capabilities |
| T7 | **Theme: Light mode warm cream palette** | S | — | Visual inspection |
| T8 | **Theme: Dark mode deeper charcoal** | S | — | Visual inspection |
| T9 | **ExpandedCardView: Reduce vertical padding** | S | — | Visual inspection |

## 9. Verification Tasks (E2E)

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: BLOCKED column displays blocked tasks** | S | T1 | `pnpm test:e2e -- blocked-column.e2e.ts` |
| V2 | **E2E: Delete task with confirmation** | S | T2 | `pnpm test:e2e -- task-delete.e2e.ts` |
| V3 | **E2E: ChipInput add/remove capabilities** | M | T3,T5 | `pnpm test:e2e -- chip-input.e2e.ts` |
| V4 | **E2E: Theme switching** | S | T7,T8 | `pnpm test:e2e -- theme-switch.e2e.ts` |

## 10. API Contracts

| Endpoint | Method | Request | Response | Errors |
|----------|--------|---------|----------|--------|
| `/admin/capabilities` | GET | — | `{ capabilities: string[] }` | 500 → fallback to defaults |
| `/admin/tasks/:id` | DELETE | — | `{ success: true }` | 404 if not found |

## 11. Open Questions

| Question | Status | Resolution |
|----------|--------|------------|
| Dependency-blocked tasks separate status? | RESOLVED | Out of scope (future work) |
| Workspace editing? | RESOLVED | No, read-only |
