---
description: Manually delegate a task to the Full Stack Engineer agent
---

# Delegate to Full Stack Engineer

This workflow allows you to manually assign a specific task to the Full Stack Engineer agent.

## Step 1: Check Agent Status

First, let's see if the Full Stack Engineer is available.

```bash
# Verify FullStack is online
Wait for the user to confirm the task details.
```

## Step 2: Assign Task

Assign the task to the Full Stack Engineer.

<rules>
1. Ask the user what they want the Full Stack Engineer to do.
2. Use `mcp_waaah_list_agents` with `role: "full-stack-engineer"` to find the agent ID.
3. If no agent is found, abort and warn the user.
4. Call `mcp_waaah_assign_task` with the user's prompt.
5. **CRITICAL:** Output the `taskId` returned by the tool.
6. Tell the user: "Task delegated! ID: `[taskId]`. Use `/check-task` to monitor progress."
</rules>


