# S19: Progress Heartbeat & Status Updates

## Context
Long-running tasks need regular status updates to:
1. Serve as a **heartbeat** proving the agent is still active
2. Provide **visibility** into what the agent is doing
3. Surface **challenges** the agent encountered
4. Enable **monitoring** of stuck or slow tasks

## Relationship to ARCHITECTURE.md
Per the **Task Lifecycle** and **Agent Volatility** assumptions, agents may crash. Regular heartbeats help distinguish between a crashed agent and one that's just taking a long time.

## Requirements

### Agent Behavior (waaah-orc)
Agents MUST call `update_progress` regularly during task execution:

1. **Frequency**: Every 2-3 minutes OR after significant milestones, whichever comes first
2. **Content**:
   - `phase`: Current phase (PLANNING, EXECUTION, TESTING, DOCUMENTATION)
   - `message`: Summary of recent work (1-2 sentences)
   - `percentage`: Optional completion estimate (0-100)
   - `challenges`: Optional list of issues encountered

### Message Format Example
```
update_progress({
  taskId: "<TASK_ID>",
  agentId: "<AGENT_ID>",
  phase: "EXECUTION",
  message: "Implemented auth middleware, now writing tests for login endpoint",
  percentage: 45,
  challenges: ["Had to refactor existing session logic to support JWT"]
})
```

### Workflow Integration
In waaah-orc.md Phase 2 (Build Loop), add:
- Heartbeat reminder after every 5-10 file operations
- Checkpoint updates at each acceptance criterion completion

### Dashboard Integration
The Dashboard should:
- Display latest progress message on task card
- Show time since last update
- Highlight tasks with stale updates (>5 minutes)

### Monitoring
Server can use heartbeat timestamps to detect stale agents:
- If `lastProgressUpdate` > 5 minutes and status is `IN_PROGRESS`, flag as potentially stuck
- Never auto-transition based on this (avoid false positives)

## Verification
- [ ] `update_progress` called at least every 3 minutes during execution
- [ ] Messages include meaningful summaries
- [ ] Dashboard displays progress updates
- [ ] Stale tasks are visually distinct

## Status
TODO
