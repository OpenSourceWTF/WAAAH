# WAAAH Agent Eviction Protocol

## 1. Overview
This protocol defines a standard mechanism for the WAAAH server to order an agent to disconnect, restart, or update. This is critical for managing the agent fleet without manual intervention or relying on timeouts.

## 2. The Eviction Signal
The `wait_for_prompt` tool will return a specific payload when an agent is targeted for eviction.

### JSON Payload
```json
{
  "controlSignal": "EVICT",
  "reason": "System update required",
  "action": "RESTART" 
}
```

*   **`controlSignal`**: MUST be `"EVICT"`. This distinguishes it from a normal Task object.
*   **`reason`**: A human-readable string explaining why the eviction is happening (e.g., "Deploying new version", "Manual kick").
*   **`action`**: (Optional) Instruction on what to do next. Defaults to `RESTART`.
    *   `RESTART`: Agent should exit the current loop and immediately try to restart/re-register.
    *   `SHUTDOWN`: Agent should exit and NOT restart (process termination).

## 3. Agent Behavior
Upon receiving an `EVICT` signal, the agent loop MUST:

1.  **Stop Polling**: Do NOT call `wait_for_prompt` again immediately.
2.  **Log**: Output the eviction reason to the console.
3.  **Execute Action**:
    *   **RESTART**: `process.exit(0)` (assuming the process manager (e.g., PM2, Docker) or the outer shell loop will restart it). Or, goto the `Register` step if the workflow supports internal restarts.
    *   **SHUTDOWN**: `process.exit(1)` (or a code that indicates "do not restart" to the supervisor).

## 4. Prompt Updates
Agent workflows (e.g., `waaah-fullstack.md`, `waaah-tester.md`) must be updated to handle this response type in their `wait_for_prompt` handling block.

### Before
```javascript
// ... receiving task ...
if (response.taskId) {
  // process task
}
```

### After
```javascript
// ... receiving response ...
if (response.controlSignal === "EVICT") {
  console.log(`[EVICT] Received eviction signal: ${response.reason}`);
  if (response.action === "SHUTDOWN") {
    process.exit(0); // Or appropriate exit
  } else {
    // Loop back to Step 1 (Register) to refresh configuration
    goto_step(1); 
  }
} else if (response.taskId) {
  // process task
}
```

## 5. Server-Side Requirements (For Implementation)
- The WAAAH Server must support an endpoint (e.g., POST `/admin/evict`) that allows an admin to queue an `EVICT` signal for a specific `agentId` or `role`.
- When `wait_for_prompt` is called by that agent, the server checks the "Eviction Queue" before the "Task Queue".
- If an eviction is pending, return the Eviction Payload immediately.

## 6. Acceptance Criteria
- [ ] `wait_for_prompt` tool prevents long-polling if an eviction is pending.
- [ ] Admin can send an eviction signal to a specific agent ID.
- [ ] Agent correctly identifies the `EVICT` payload.
- [ ] Agent logs the reason and exits/restarts as instructed.
