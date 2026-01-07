# Infinite Scroll & Skeleton UI Requirements

## 1. Overview
Improve the Admin Dashboard's performance and UX/Layout by implementing Infinite Scroll for the task list and using Skeleton Screens for loading states. Critically, correct the layout so Header and Agent Fleet are fixed.

## 2. Layout & Interactions

### 2.1 Fixed Layout (Critical)
**Problem**: Currently, the whole page scrolls, hiding the Agent Fleet status when viewing logs.
**Solution**:
-   **Body**: `overflow: hidden; height: 100vh;`
-   **Structure**:
    -   `header`: Fixed height (e.g., 60px), sticky top.
    -   `main-container`: Flex row, `flex: 1`, `overflow: hidden`.
        -   `sidebar` (Agents): Fixed width, `overflow-y: auto`.
        -   `content` (Tasks): `flex: 1`, `overflow-y: auto` (This is the *only* scrollable area for tasks).

### 2.2 Infinite Scroll
**Pattern**:
-   Initial Load: Fetch first 20 items.
-   Scroll Event: Detect when user reaches bottom 20% of the `content` container.
-   Fetch Next: Call API with `offset=20`.
-   Append: Add new items to the list.
-   End State: Stop fetching when API returns fewer than requested items.

### 2.3 Skeleton UI
**Component**: `.task-skeleton`
-   Visual: Gray block with shimmering gradient animation (`@keyframes shimmer`).
-   Layout: Mimic the height and shape of a Task Card.
-   Usage: Show 3-5 skeleton cards while fetching data (initial or next page).
-   Removal: Replace with actual Task Cards once data arrives.

## 3. Technical Requirements

### 3.1 CSS Updates
-   Implement the "Fixed Layout" flexbox structure in `style.css`.
-   Add `.skeleton` and `.shimmer` classes.

### 3.2 JS Logic (`app.js`)
-   Implement `IntersectionObserver` (or scroll listener) on the Task List container.
-   Manage `isLoading` state to prevent duplicate fetches.
-   Manage `offset` and `hasMore` state.

## 4. Acceptance Criteria
- [ ] Header and Agent Sidebar stay visible while scrolling the Task List.
- [ ] Task list loads more items automatically when scrolling to bottom.
- [ ] "Shimmering" gray bars appear before task content loads.
- [ ] No "Spinner" is used for list loading.
