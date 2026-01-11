
import os

file_path = ".worktrees/feature-task-1768089767889-rn7jmx/packages/mcp-server/src/state/task-repository.ts"

with open(file_path, 'r') as f:
    content = f.read()

# Interface insertion
interface_target = "  /** Get task history with filtering and search */"
interface_insert = """  /** Get all agents that are currently assigned tasks (Active only) */
  getBusyAgentIds(): string[];
"""

# Class insertion
class_target = "  getHistory(options: { status?: TaskStatus | 'ACTIVE'; limit?: number; offset?: number; agentId?: string; search?: string }): Task[] {"
class_insert = """  getBusyAgentIds(): string[] {
    const rows = this.database.prepare(
      `SELECT DISTINCT assignedTo FROM tasks WHERE status IN ('ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK') AND assignedTo IS NOT NULL`
    ).all() as any[];
    return rows.map(r => r.assignedTo);
  }

"""

if interface_insert not in content:
    content = content.replace(interface_target, interface_insert + interface_target)
    
if class_insert not in content:
    content = content.replace(class_target, class_insert + class_target)

with open(file_path, 'w') as f:
    f.write(content)
print("Updated task-repository.ts")
