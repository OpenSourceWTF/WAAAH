# S13: Dashboard Task Comments

## Context
Administrators need a way to inject feedback or questions into a task thread directly from the UI.

## Relationship to ARCHITECTURE.md
Per the **Task Lifecycle**, tasks transition `IN_REVIEW → QUEUED` when user provides feedback. Comments are the mechanism for delivering that feedback. They persist with the task so agents receive context when re-picking the task.

## Requirements

### Server Endpoint
`POST /admin/tasks/:taskId/comments` { content: string }
- Logic: Call `queue.addMessage(taskId, 'user', content)`
- Persistence: Persists to `task_messages` table (schema: `id, taskId, role, content, timestamp, metadata`)

### UI Interaction
Add a text input and "Add Comment" button to the **Timeline** tab in the Dashboard.

### Real-time Feedback
Logic already exists to interweave `messages` with `history`, sorted by timestamp.

## Status
DONE
