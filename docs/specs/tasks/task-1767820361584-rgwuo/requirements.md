# Recent Activity Feed Requirements (REVISED)

## 1. Overview
A scrolling "System Log" of raw system events in the Admin Dashboard, formatted as a timestamped console-like feed.

## 2. Technical Requirements

### 2.1 Backend (SSE Stream)
**Current State**: `/admin/delegations/stream` emits `delegation` and `completion` events.
**Reference**: `packages/mcp-server/src/server.ts` (lines 179-205).

**Changes**:
1.  **Extend Event Bus**: emit low-level events.
    -   `agent_connected`: When an agent registers or reconnects.
    -   `agent_disconnected`: When an agent is detected offline (via cleanup).
    -   `task_update`: When a task status changes (STARTED, FAILED, COMPLETED).
2.  **Update Stream Endpoint**:
    -   Payload structure (Simplified):
        ```json
        {
          "type": "activity",
          "timestamp": "10:00:01",
          "message": "[10:00:01] Agent @FullStack connected."
        }
        ```
    -   Alternatively, keep structured data and let frontend format the string.
        -   Better: Use structured data (`category`, `message`, `timestamp`) but Frontend renders it as a single log line.

### 2.2 Frontend (Admin Dashboard)
**Location**: `public/index.html` / `app.js`

1.  **UI Component**:
    -   **Style**: "System Log" / "Console" aesthetic.
    -   **Appearance**: Dark background, Monospace font, Compact line height.
    -   **Content**: Single list of text lines.
    -   **Format**: `[HH:MM:SS] <Message>`
        -   Example: `[14:02:10] Agent @FullStack connected.`
        -   Example: `[14:02:15] Task task-123 assigned to @TestEng.`
2.  **Behavior**:
    -   Auto-scroll to bottom (like a terminal) when new events arrive.
    -   Optional: "Pause Scroll" on hover.

## 3. Acceptance Criteria
- [ ] UI looks like a system log (monospace, compact).
- [ ] Events are prefixed with `[HH:MM:SS]`.
- [ ] Feed includes Agent Connections, Disconnections, and Tasks.
- [ ] Feed auto-scrolls to newest entry.
