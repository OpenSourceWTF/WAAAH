# Historic Task View Specification

## 1. Overview
Allow users to view a history of Completed and Failed tasks in the Admin Dashboard, separate from the Active task queue.

## 2. Requirements

### 2.1 Backend API Updates
**Problem**: Current `GET /admin/tasks/history?status=X` only supports a single status string.
** Requirement**: Update `TaskQueue.getTaskHistory` and the `/admin/tasks/history` endpoint to support multiple statuses.

- **Endpoint**: `GET /admin/tasks/history`
- **Parameter**: `status` (string, comma-separated)
    - Example: `?status=COMPLETED,FAILED`
- **Logic**: 
    - Split `status` string by comma.
    - If multiple statuses, use SQL `WHERE status IN (...)`.
    - If single status, use SQL `WHERE status = ?`.

### 2.2 Frontend UI Updates
**Location**: `public/index.html` / `public/app.js`

1.  **View Toggle**: Add a Switch or Tabs Control above the Task Card container.
    - **Options**: "Active Tasks" (Default), "History".
2.  **History View**:
    - When "History" is selected, fetch tasks from `/admin/tasks/history?status=COMPLETED,FAILED&limit=50`.
    - Display tasks using the existing Card component, but maybe with a slightly different visual treatment (e.g., muted background).
    - Show "Load More" button if 50 tasks are returned (pagination using `offset`).
3.  **Visuals**:
    - Completed Tasks: Green Accent.
    - Failed Tasks: Red Accent.

## 3. Acceptance Criteria
- [ ] API accepts `?status=COMPLETED,FAILED` and returns both types.
- [ ] Dashboard shows a "History" toggle.
- [ ] Clicking "History" loads the last 50 completed/failed tasks.
- [ ] Switching back to "Active" shows the current queue.
- [ ] "Load More" button works for history pagination.
