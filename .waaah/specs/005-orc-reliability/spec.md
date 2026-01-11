# Improving Orc Workflow Reliability Specification
**Version:** 0.1 | **Status:** Draft

## 1. Overview
**Problem:** The `orc` agent hallucinates branch names (e.g., `feature-heartbeat-overhaul` vs `feature-{taskId}`), causing the UI and system to lose track of diffs. This is exacerbated by a distributed architecture where the Server and Repo may be on different machines.

**Users:** Orchestrator Agents (`orc`), Developers.

**Solution:** mitigate hallucinations via Prompt Engineering and/or Tooling constraints, ensuring the correct `feature-{taskId}` convention is strictly followed.

## 2. Requirements
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | **Deterministic Naming:** All worktrees MUST be named `feature-{taskId}`. | P0 |
| FR-2 | **Prompt-Driven Execution:** The setup command MUST be strictly defined in the Task Prompt itself. | P0 |
| FR-3 | **No Implicit Backend Actions:** `ack_task` logic must NOT assume local filesystem access. | P0 |

## 3. Architecture & Gap Analysis
**Constraint Resolution:**
- **Server vs Repo:** The Server may be remote. The Agent executes commands locally.
- **Solution:** "Prompt Injection".
    - The Server (via `assign_task` or Orchestrator logic) constructs the prompt.
    - The Prompt *contains* the mandatory setup command: `git worktree add .worktrees/feature-{taskId} -b feature-{taskId}`.
    - The Agent blindly follows the prompt, ensuring 0% hallucination rate on the branch name.

**"Saved Branch Name" Note:**
- User noted: *"I thought we saved branch name and commit to the task on resolved"*
- **Status:** The `orc` workflow *does* save this in the `response`.
- **Gap:** The `/diff` API (and `admin-tasks.ts`) currently hardcodes looking for `feature-{taskId}`.
- **Decision:** While we could patch the API to read the saved name, **enforcing the convention** via the Prompt is superior for consistency and debugging. We will standardize on `feature-{taskId}`.

## 4. Proposed Implementation
### A. The "Prompt-Injector" Pattern
Modify `TaskLifecycleService` or `assign_task` handler?
- **Decision:** Modify `assign_task` in `TaskHandlers`.
- **Logic:**
    1. Generate `taskId`.
    2. BEFORE queuing: Append strict setup instructions to the `prompt`.
    3. `Prompt += "\n\n## SETUP (Mandatory)\nRun exactly: git worktree add .worktrees/feature-${taskId} -b feature-${taskId}"`

### B. Workflow Updates
- Update `waaah-orc-agent.md` to say: "EXECUTE the Setup command provided in the prompt."

## 5. Diff Persistence Architecture
**Problem:**
- User wants diffs saved on resolve.
- **Constraint:** If Server is remote, it cannot run `git diff` on the Agent's worktree.
- **Current Failure:** Server tries `git diff` locally -> Fails if worktree missing/remote.

**Solution:**
1.  **Agent Responsibility:** Agent must run `git diff origin/main...HEAD` and include the **raw text** in `send_response({ diff: "..." })`.
2.  **Server Responsibility:**
    -   Store `diff` in `task.response`.
    -   Update `GET /tasks/:taskId/diff` to return `task.response.diff` if present.
    -   Fallback to local `git diff` only if response diff is missing.

**Requirements:**
| ID | Requirement | Priority |
|----|-------------|----------|
| FR-4 | Agent MUST include raw diff in `send_response` payload. | P0 |
| FR-5 | Server MUST serve stored diff from DB via `/diff` endpoint. | P0 |
