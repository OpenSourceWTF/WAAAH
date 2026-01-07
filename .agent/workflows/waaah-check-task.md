---
description: Check the status of a specific task
---

# Check Task Status

This workflow allows you to check the current status of a previously assigned task.

## Step 1: List Active Tasks

Query the system for all connected agents and their current tasks.

<rules>
1. Call `list_agents` (or `waaah_list_agents`).
2. Display a dashboard of all agents:
   - **Name**: Agent Display Name
   - **Status**: WAITING / PROCESSING / OFFLINE
   - **Current Task**: Task ID (if any)
3. Do NOT wait for user input.
</rules>
