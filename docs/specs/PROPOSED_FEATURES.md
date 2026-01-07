# Proposed WAAAH Features

## 1. Live Memory Inspector
**Problem**: The "Brain" (Knowledge Graph) is a black box. Agents write to it, but developers can't easily see what entities or relations exist, making it hard to debug "hallucinations" or missing context.

**Proposed Solution**:
-   **UI**: A "Knowledge" tab in the Admin Dashboard.
-   **Feature**:
    -   Search bar to find Nodes (e.g., "Bot Adapters").
    -   Visual Graph Explorer (using library like `react-force-graph` or Cytoscape).
    -   Raw JSON inspector for Node Observations.
-   **Integration**: Connects to MCP `memory` server's `read_graph` and `search_nodes` tools.

**Priority**: **High** (Critical for debugging Agent Intelligence).

---

## 2. Active Agent Health Check
**Problem**: Agents can crash silently or hang (state `WAITING` but process dead). The server waits indefinitely, task queue stalls.

**Proposed Solution**:
-   **Mechanism**: Server sends a `PING` event (via SSE or separate endpoint) to registered agents every 30s.
-   **Expectation**: Agent must respond with `PONG` within 5s.
-   **Action**: If 3 consecutive PINGs fail, Server marks agent `OFFLINE` and acts according to Eviction Protocol.
-   **UI**: Show "Latency" and "Last Heartbeat" in Agent Fleet list.

**Priority**: **High** (Critical for System Reliability).

---

## 3. Visual Dependency Graph
**Problem**: In complex orchestration, Task A waits for Task B. The flat task list doesn't show this relationship, making it look like the system is "stuck" for no reason.

**Proposed Solution**:
-   **UI**: A "Workflow" view (DAG Visualization).
-   **Feature**:
    -   Nodes = Tasks.
    -   Edges = Dependencies (`dependencies` array).
    -   Colors: Green (Done), Yellow (Running), Gray (Pending), Red (Blocked/Failed).
-   **Interactivity**: Click a node to see the Task Details/Prompt.

**Priority**: **Medium** (Great DX, but flat list works for now).

---

## 4. Manual Task Prioritization
**Problem**: Urgent bug fixes or interruptions get stuck behind a long queue of low-priority tasks.

**Proposed Solution**:
-   **UI**: "Drag and Drop" reordering in the Task Queue list.
-   **Backend**: Update `priority` field or internal `order` index.
-   **Feature**: "Move to Top" button for quick escalation.

**Priority**: **Medium** (Useful for manual override).

---

## 5. The "Librarian" Agent (Auto-Documentation)
**Problem**: `PRO_CONTEXT.md` and `docs/` become stale as code evolves. Developers forget to update documentation.

**Proposed Solution**:
-   **Role**: `@Librarian` (Background Agent).
-   **Trigger**: Watch for file changes (via `git diff` or file watcher) in `src/`.
-   **Action**:
    -   Reads changes.
    -   Updates relevant `.md` files in `docs/` or `knowledge/`.
    -   Summarizes changes into `PRO_CONTEXT.md`.
-   **Safety**: Opens a PR (or creates a "Review Task") instead of committing directly.

**Priority**: **Low** (Luxury/Long-term).
