# UI Spec Submission Specification
**Version:** 1.0 | **Status:** Ready

## 1. Overview
**Problem:** Users must use CLI to submit specs/tasks. No UI submission path.
**Users:** Developers, PMs using Mission Command dashboard.
**Solution:** Spec submission form with workspace awareness and capability routing.

## 2. User Stories
- [ ] US-1: As a user, I want to submit specs from the dashboard, so I don't need CLI access
- [ ] US-2: As a user, I want to select a workspace, so tasks go to the right agents
- [ ] US-3: As a user, I want to see task source indicators, so I know origin

## 3. Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | **Workspace Dropdown**: List workspaces from connected agents' `workspaceContext` |
| FR-2 | **Capability Routing**: Route to `spec-writing` if available, else `code-writing` |
| FR-3 | **Pre-submit Validation**: Check capability exists on selected workspace |
| FR-4 | **Spec Template Form**: Fields: Problem, Users, Requirements, Success Metrics, Out of Scope |
| FR-5 | **Queue Warning Modal**: If no matching agents, warn but allow submit |
| FR-6 | **Source Badge**: Show "UI" / "CLI" / "Agent" badge on task cards |
| NFR-1 | Form must be accessible (ARIA labels, keyboard nav) |

## 4. Edge Cases

| Scenario | Behavior |
|----------|----------|
| No agents connected | Disable submit, show "No agents available" |
| No agents for workspace | Show warning modal, allow queuing |
| Agent disconnects mid-form | Re-validate on submit |

## 5. Out of Scope
- Authentication (see Spec 007)
- Multi-workspace task routing
- Drag-and-drop file attachments

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Submission success rate | >95% |
| Time to submit | <30 seconds |

---

## Implementation Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **API: Workspace List Endpoint** | S | — | `curl /admin/workspaces \| jq length` |
| T2 | **API: Capability Check Endpoint** | S | T1 | `curl /admin/workspaces/X/capabilities` |
| T3 | **UI: Spec Submission Form Component** | M | — | Visual inspection + form submit |
| T4 | **UI: Workspace Dropdown** | S | T1,T3 | Dropdown shows connected workspaces |
| T5 | **UI: Queue Warning Modal** | S | T2,T3 | Submit with no agents → modal appears |
| T6 | **API: Task Source Field** | S | — | `POST /enqueue` accepts `source` field |
| T7 | **UI: Source Badge on TaskCard** | S | T6 | Badge shows "UI"/"CLI"/"Agent" |

## Verification Tasks (E2E)

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: Submit Spec from UI** | M | T3,T4 | `pnpm test -- spec-submission.e2e` |
| V2 | **E2E: Capability Routing** | M | T2,T3 | PM agent gets spec-writing task |
