# Task Search & Filter Requirements

## 1. Overview
Allow Admins to find specific tasks in the Dashboard using text search and status filters, supported by server-side query execution for scalability (Infinite Scroll).

## 2. Technical Requirements

### 2.1 Backend (API & DB)
**Reference**: `packages/mcp-server/src/state/queue.ts`, `server.ts`.

**Changes**:
1.  **Update `TaskQueue.getTaskHistory`**:
    -   Add `search` parameter (string, optional).
    -   Update SQL query:
        ```sql
        AND (
          id LIKE @searchPattern OR
          prompt LIKE @searchPattern OR
          response LIKE @searchPattern
        )
        ```
    -   Where `@searchPattern` is `%${search}%`.
2.  **Update Endpoint**:
    -   `GET /admin/tasks/history`: Accept `q` query param.
    -   Pass to `getTaskHistory`.

### 2.2 Frontend (Admin Dashboard)
**Location**: `public/index.html` / `app.js`

1.  **Search Bar**:
    -   Input field: "Search tasks..." (debounce 300ms).
    -   On change: Update state `query`.
2.  **Filter Controls**:
    -   Dropdown/Pills: "All", "Completed", "Failed", "Running" (Queued/Assigned).
    -   On change: Update state `status`.
3.  **Fetch Logic**:
    -   Combine params: `?q=${query}&status=${status}&limit=50`.
    -   Trigger fetch on any filter change.
    -   Reset pagination (`offset=0`) on filter change.

## 3. Acceptance Criteria
- [ ] Backend supports `?q=login` and returns tasks containing "login" in prompt/response.
- [ ] Backend supports `?status=FAILED` combined with search.
- [ ] Frontend shows Search Input and Status Filters.
- [ ] Typing in search refetches results (debounced).
- [ ] Changing filter refetches results.
