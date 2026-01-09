# WAAAH Master Architecture Document (V5 - Pure Hub)

> [!IMPORTANT]
> **Status**: APPROVED V5
> **Model**: Pure Hub (State & Coordination Only)
> **Constraint**: Server never touches Git/Files.

## 1. Core Assumptions
The system design relies on the following invariants:
1.  **Git is the Source of Truth**: The Server only knows about `Task IDs` and `Commit SHAs`. It never stores Code.
2.  **Agent Autonomy**: Agents manage their own disk/environment. The Server cannot "fix" a broken Agent.
3.  **Reviewer Liveness**: For every Workspace Context (e.g., TeaProtocol), there MUST be at least one active Agent with `role: reviewer` (or a dual-role Dev). If no Reviewer exists, tasks will stall in `IN_REVIEW`.
4.  **Trust Boundary**: The Server trusts Agents to report their `workspaceContext` truthfully. See [Agent Context Spec](./agent_capabilities_and_context_spec.md).
5.  **Connectivity**: All Agents have independent access to the Git Provider (GitHub).

---

## 2. System Topology

```mermaid
graph TD
    subgraph "The Hub (State Engine)"
        Server[MCP Server]
        Queue[(Task Database)]
        Registry[Agent Registry]
    end

    subgraph "Git Provider"
        Origin[GitHub Repo]
    end

    subgraph "Spoke: Developer"
        Dev[Dev Agent]
        DevFS[Local Worktree]
    end
    User[User / Developer] -->|Chat/Commands| Bot[Unified Bot]
    User -->|View/Manage| Dash[Dashboard UI]
    User -->|CLI Ops| CLI[WAAAH CLI]

    subgraph Control_Plane
        Bot -->|HTTP/MCP| Server[MCP Server]
        Dash -->|HTTP/SSE| Server
        CLI -->|HTTP/MCP| Server
        Server -->|Read/Write| DB[(SQLite Database)]
    end

    subgraph Execution_Plane
        Server --"MCP (SSE)"--> Agent1[Orchestrator Agent]
        Server --"MCP (SSE)"--> Agent2[Coding Agent]
    end

    Agent1 <--> WORKTREE1[Git Worktree A]
    Agent2 <--> WORKTREE2[Git Worktree B]
```

### Components Detail

1.  **MCP Server (`packages/mcp-server`)**:
    *   **Role**: Scheduling, communications, data persistence, and task state management.
    *   **Constraint**: NO access to agent's remote contexts or file systems.
    *   Hosts MCP endpoints and Admin API.
    *   Runs the `HybridScheduler` (periodic cleanup/rebalancing loop).

2.  **Unified Bot (`packages/bot`)**:
    *   Interface for users on Discord and Slack.
    *   Adapters normalize messages into a standard format.

3.  **Dashboard (`packages/mcp-server/client`)**:
    *   React/Vite app visualization of the Kanban board.
    *   Real-time updates via Server-Sent Events.

4.  **CLI (`packages/cli`)**:
    *   Operator tool for manual management (`waaah send`, `waaah status`).
    *   Used for headless operations.

5.  **Agents**:
    *   Autonomous processes connecting via MCP.
    *   **Responsibility**:
        *   Poll for work (`wait_for_prompt`).
        *   **Worktree Management**: Create/Manage isolated git worktrees for tasks.
        *   **Execution**: Perform changes, commit, and push.

---

## 3. Core Workflows

### 3.1 Task Lifecycle

Tasks move through a strict state machine. The "Happy Path" involves a review loop.

```mermaid
stateDiagram-v2
    [*] --> QUEUED: Created via Bot/CLI
    QUEUED --> ASSIGNED: Scheduler matches Agent
    ASSIGNED --> PENDING_ACK: Server reserves Agent
    PENDING_ACK --> IN_PROGRESS: Agent ACKs task
    PENDING_ACK --> QUEUED: Timeout (Requeue)
    
    IN_PROGRESS --> BLOCKED: Agent needs info
    BLOCKED --> IN_PROGRESS: User answers
    
    IN_PROGRESS --> IN_REVIEW: Agent Commits & Pushes
    IN_REVIEW --> APPROVED: User Approves (No Feedback)
    IN_REVIEW --> QUEUED: User Requests Changes (Feedback)
    
    APPROVED --> COMPLETED: Final Transition
    
    IN_PROGRESS --> FAILED: Error/Crash
    
    COMPLETED --> [*]
    FAILED --> [*]
```

**Key Transitions**:
*   **IN_PROGRESS → IN_REVIEW**: Agent has committed changes to a feature branch and pushed to origin.
*   **IN_REVIEW → QUEUED**: User provides feedback/comments. Status resets to allow Agent to pick it up again (or a different agent).
*   **IN_REVIEW → APPROVED**: User is satisfied. No further changes needed.
*   **APPROVED → COMPLETED**: System finalizes the task.

### 3.2 Task Assignment & Scheduler

The `HybridScheduler` runs frequently (every ~2s) to process the queue.

**Assignment Logic**:
Tasks are **pulled** by agents via `wait_for_prompt`. The server's scheduler acts as a matchmaker to "reserve" a task for a specific polling request.

1.  **Orphan/Timeout Check**: Requeue `PENDING_ACK` tasks > 30s.
2.  **Unblock**: Move `BLOCKED` tasks to `QUEUED` if dependencies are resolved.
3.  **Match & Reserve**:
    *   Trigger: Agent polls `wait_for_prompt`.
    *   Logic:
        *   **Capabilities**: Must match `requiredCapabilities`.
        *   **Workspace Context**: `repoId` matches Agent's current context (to reuse worktrees).
        *   **Agent Hint**: Preference for specific agent IDs.
    *   Action: Task state `QUEUED` → `ASSIGNED` → `PENDING_ACK`.

---

## 4. State Management & Data

### Database Schema
We use SQLite (`mcp.db`) as the single source for all state.

### Key Assumptions
1.  **Agent Volatility**: Agents may crash. `ACK_TIMEOUT` handles this.
2.  **Environment Specificity**: The file system is **NOT** generic. We assume unique environments.
    *   Agents must report their `workspaceContext` (Repo ID, Branch, Local/Github).
    *   `assign_task` specifies the target environment.
3.  **Git Worktree Mandate**:
    *   Agents MUST use `git worktree` for isolation.
    *   Flow: `create_worktree` (Standardized branch name) → Do Work → Commit → Push.
    *   Main branch should remain clean.
4.  **No Server Access to FS**: The MCP Server knows *about* the file system (via metadata) but cannot touch it directly.

---

## 5. Reverse Engineering Notes

*   **Scheduler**: Originally "Hybrid" (Push/Pull), now strictly a helper for the Pull-based `wait_for_prompt` mechanism.
*   **Worktree Tooling**: Need to implement/standardize `create_worktree` MCP tool with enforced branch naming conventions.
