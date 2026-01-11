# Manual Task Adding Specification
**Version:** 1.0 | **Status:** Ready
**Depends On:** [Spec-006 UI Spec Submission]

## 1. Overview
**Problem:** Dashboard UI exists but cannot submit tasks. Human operators must use CLI.
**Users:** Human operators adding tasks to agents via Mission Command dashboard.
**Solution:** Full-screen task submission form with workspace/role selection, image support, and toast notifications via EventBus.

## 2. Integration Path
**How users access this feature:**
- UI: "New Task" button on Dashboard → Full content area form → Submit → Toast + Kanban view
- API: `POST /admin/enqueue` → TaskQueue.enqueue() → EventBus.emit('task:created') → SSE to dashboard

## 3. User Stories
- [x] US-1: As an operator, I want to submit tasks from the dashboard, so I don't need CLI access
- [x] US-2: As an operator, I want to select a workspace, so tasks go to the right agents
- [x] US-3: As an operator, I want to select required roles, so tasks match agent capabilities
- [x] US-4: As an operator, I want to attach images, so agents have visual context
- [x] US-5: As an operator, I want toast notifications for task events, so I know what's happening

## 4. Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | **Task Form Component**: Full content area form (like expanded task cards). Fields: Title, Prompt (markdown), Priority dropdown, Image attachments |
| FR-2 | **Workspace Dropdown**: Fetch from `/admin/agents`, extract unique `workspaceContext` values |
| FR-3 | **Role Checkboxes**: Based on selected workspace, show checkboxes for registered roles (`orchestrator`, `code-writing`, `spec-writing`, etc.) |
| FR-4 | **Image Attachments**: Drag-drop or click-to-upload images. Store as base64 dataUrl in task context |
| FR-5 | **POST /admin/enqueue**: API endpoint accepting `{ prompt, title?, priority?, workspace?, requiredCapabilities?, images?, source: "UI" }` |
| FR-6 | **Toast via EventBus**: Subscribe to `task:created` event. Show "Task queued" toast with task ID |
| FR-7 | **Toast Filtering**: Allow configuring which events trigger toasts (like webhook filtering) |
| FR-8 | **Warning Modal**: If no agents match workspace/role, show warning as a toast but allow queuing |
| FR-9 | **Submit Flow**: On submit → API call → Close form → Show toast → Return to Kanban view |
| NFR-1 | Form must be accessible (ARIA labels, keyboard nav) |

## 5. Edge Cases

| Scenario | Behavior |
|----------|----------|
| No agents connected | Show warning toast: "No agents available. Queue anyway?" → Queue with QUEUED status |
| No agents for workspace/role | Show warning toast, allow queuing |
| Image too large (>5MB) | Client-side validation error |
| API error | Toast error message, keep form open |
| Workspace has no roles | Show "No registered roles" checkbox disabled |

## 6. Out of Scope
- Authentication (see Spec 007)
- Multi-task batch submission
- Task templates/presets
- Recurring task scheduling

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Task creation success rate | >95% |
| Time to create task | <30 seconds |
| Toast notification latency | <500ms from event |

## 8. Implementation Tasks

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| T1 | **API: POST /admin/enqueue endpoint** | S | — | `curl -X POST /admin/enqueue -d '{"prompt":"test"}' \| jq .taskId` |
| T2 | **UI: TaskCreationForm component** | M | — | Form renders with all fields |
| T3 | **UI: Workspace dropdown (fetch from agents)** | S | T2 | Dropdown shows connected workspaces |
| T4 | **UI: Role checkboxes (per workspace)** | S | T2,T3 | Checkboxes update when workspace changes |
| T5 | **UI: Image attachment upload** | M | T2 | Images preview and submit as base64 |
| T6 | **UI: Toast notification system via EventBus** | M | — | Subscribe to task events, show toasts |
| T7 | **UI: Toast filtering config** | S | T6 | Can configure which events show toasts |
| T8 | **UI: Warning modal for no agents** | S | T2 | Modal appears when no matching agents |
| T9 | **UI: Integration into Dashboard** | S | T2,T6 | "New Task" button opens form |

## 9. Verification Tasks (E2E)

| ID | Title | Size | Deps | Verify |
|----|-------|------|------|--------|
| V1 | **E2E: Submit task from UI** | M | T1,T2,T9 | `pnpm test -- task-creation.e2e --grep "submit task"` |
| V2 | **E2E: Toast notifications** | M | T6,T1 | `pnpm test -- toast.e2e --grep "task created toast"` |
| V3 | **E2E: Warning on no agents** | S | T8 | `pnpm test -- task-creation.e2e --grep "warning modal"` |

## 10. API Contracts

| Endpoint | Method | Request | Response | Errors |
|----------|--------|---------|----------|--------|
| `/admin/enqueue` | POST | `{ prompt: string, title?: string, priority?: "normal"\|"high"\|"critical", workspace?: string, requiredCapabilities?: string[], images?: {dataUrl, mimeType, name}[], source: "UI" }` | `{ success: true, taskId: string }` | 400 invalid input, 500 server error |
| `/admin/agents` | GET | — | `Agent[]` with workspaceContext | 500 server error |

## 11. Open Questions

| Question | Status | Resolution |
|----------|--------|------------|
| Max image size limit? | RESOLVED | 5MB per image, client-side validation |
| Max images per task? | RESOLVED | 5 images max |
| Toast auto-dismiss timing? | RESOLVED | 3 seconds default, configurable |
