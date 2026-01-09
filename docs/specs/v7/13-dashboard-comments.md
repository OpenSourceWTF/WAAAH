# S13: Dashboard Task Comments

## Context
Administrators need a way to inject feedback or questions into a task thread directly from the UI.

## Requirements

### Server Endpoint
`POST /admin/tasks/:taskId/comments` { content: string }
- Logic: Call `queue.addMessage(taskId, 'user', content)`
- Persistence: Persists to `task_messages` table (schema: `id, taskId, role, content, timestamp, metadata`)

### UI Interaction
Add a text input and "Add Comment" button to the **Timeline** tab (Dashboard.tsx, lines 747-776)

### Real-time Feedback
Logic already exists to interweave `messages` with `history`, sorted by timestamp with safe nullish coalescing.

## Status
DONE
