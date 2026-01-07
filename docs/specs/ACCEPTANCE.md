# Acceptance Criteria: Agent Status & Task Assignment Persistence

## Feature: Agent Fleet Status Fidelity

### 1. Status Accuracy
- **GIVEN** an agent has acknowledged a task (directly or via role)
- **THEN** `get_agent_status` MUST return `status: "PROCESSING"`
- **AND** the task ID MUST be listed in `currentTasks`
- **AND** this state MUST persist across server restarts

### 2. Role-Based Assignment Persistence
- **GIVEN** a task text targeted at a `role` (e.g., "developer")
- **WHEN** an agent (`fullstack-1`) accepts the task
- **THEN** the task's `assignedTo` field MUST be persisted in the database as `fullstack-1`
- **AND** subsequent queries for the agent's tasks MUST include this task

### 3. CLI Visibility
- **GIVEN** an agent is working on a task
- **THEN** `waaah status <agentId>` MUST show `🔵 [PROCESSING]`

---

## Feature: Auto-Reconnection for Bot Adapters

### 1. Disconnection Detection
- **GIVEN** a Bot Adapter (Discord/Slack) connected to the WAAAH server
- **WHEN** the server connection drops (e.g., server restart, network issue)
- **THEN** the bot MUST log the disconnection event: `[WARN] Disconnected from WAAAH server`
- **AND** verify readiness to reconnect.

### 2. Exponential Backoff Strategy
- **GIVEN** a disconnected state
- **THEN** the bot MUST attempt to reconnect repeatedly.
- **AND** the delay between attempts MUST follow an exponential backoff pattern:
    - Start at ~1s
    - Multiplier: 1.5x or 2x
    - Max Delay: 30s
    - Jitter: Optional but recommended
- **AND** log each attempt: `[INFO] Reconnecting in Xs...`

### 3. State Re-registration
- **GIVEN** the bot successfully reconnects
- **THEN** it MUST immediately re-register its agent capabilities via `register_agent`.
- **AND** it MUST re-establish the SSE stream for delegations.
- **AND** log success: `[INFO] Reconnected and re-registered as <AgentID>`.
