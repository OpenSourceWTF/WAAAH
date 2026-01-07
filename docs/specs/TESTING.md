# Test Specifications

## Feature: Force Retry Task
...

## Feature: Expandable Task Cards
...

## Feature: Layout Refactor (Shout Tab)

### Overview
Verify that "The Shout" (Activity Feed) has been moved from the sidebar to a dedicated tab.

### Reference
- Task: task-1767822847657-wntcv
- Component: Dashboard.tsx

### Test Scenarios

#### Scenario 1: Tab Structure
- Description: Verify "The Shout" tab trigger and content exist.
- Input: `Dashboard.tsx`.
- Expected:
  - Tab Trigger with value "logs" and label "the shout (logs)".
  - Tab Content with value "logs" containing `<ActivityFeed />`.

#### Scenario 2: Sidebar Cleanup
- Description: Verify Sidebar only contains Agent Status.
- Input: `Dashboard.tsx`.
- Expected:
  - Sidebar div (w-96) contains "DA BOYZ".
  - Sidebar div does NOT contain "THE SHOUT" header or second `<ActivityFeed />`.

### Verification
pnpm test packages/mcp-server/tests/dashboard_layout.test.ts

## Feature: Bot Core Logic

### Overview
Verify the core logic of the Discord/Slack bot, including command parsing, task enqueuing, and polling mechanisms.

### Reference
- Task: task-1767825283017-qeztr
- Component: packages/bot/src/core/bot.ts

### Test Scenarios

#### Scenario 1: Command Parsing
- Description: Verify bot correctly parses commands like `status`, `clear`, and `update`.
- Input: `bot.handleMessage` with various command strings.
- Expected: Corresponding handlers (handleStatus, handleClear) are invoked.

#### Scenario 2: Task Enqueuing
- Description: Verify bot parses `@Agent` targeting and calls `axios.post(/admin/enqueue)`.
- Input: "@TestEng check this out"
- Expected:
  - `axios.post` called with prompt="check this out" and role="test-engineer".
  - Reply sent with "Task Scheduled".

### Verification
pnpm test packages/bot/src/core/bot.test.ts

## Feature: Event Bus & Logging

### Overview
Verify the server-side event bus for internal communication and database persistence of logs.

### Reference
- Task: task-1767825283017-qeztr
- Component: packages/mcp-server/src/state/events.ts

### Test Scenarios

#### Scenario 1: Activity Logging
- Description: Verify `emitActivity` broadcasts event and writes to DB.
- Input: `emitActivity('SYSTEM', 'test log')`
- Expected:
  - Event 'activity' emitted.
  - DB `INSERT INTO logs` executed.

### Verification
pnpm test packages/mcp-server/tests/events.test.ts
