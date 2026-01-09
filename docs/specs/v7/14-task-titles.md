# S14: Descriptive Task Titles

## Context
"execute_prompt" is not descriptive in the UI. Tasks need concise titles for better dashboard scannability.

## Requirements

### Schema
Add optional `title: string` to `Task` interface and Zod schema.

### Auto-generation
In `assign_task` (MCP tool), if no title provided, extract first line of prompt (clamped to 80 chars).

### Dashboard UI
Update `Dashboard.tsx` and `KanbanBoard.tsx` to display `task.title` as the primary header.

### Fallback
UI should fall back to `command` or a snippet of the `prompt` if `title` is missing.

## Status
DONE
