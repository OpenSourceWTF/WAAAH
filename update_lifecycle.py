
import os

file_path = ".worktrees/feature-task-1768089767889-rn7jmx/packages/mcp-server/src/state/services/task-lifecycle-service.ts"

with open(file_path, 'r') as f:
    content = f.read()

# Methods to add
methods = """
  resetStaleTasks(): void {
    try {
      // Reset PENDING_ACK tasks to QUEUED
      const stale = this.repo.getByStatus('PENDING_ACK');
      for (const task of stale) {
        console.log(`[TaskLifecycle] Resetting PENDING_ACK task ${task.id} to QUEUED on startup`);
        this.updateStatus(task.id, 'QUEUED');
      }
      
      // Reset waiting agents
      this.persistence.resetWaitingAgents();
    } catch (e: any) {
      console.error(`[TaskLifecycle] Failed to reset stale state: ${e.message}`);
    }
  }

  ackTask(taskId: string, agentId: string): { success: boolean; error?: string } {
    const task = this.repo.getById(taskId);

    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status !== 'PENDING_ACK') {
      return { success: false, error: 'Task is not in PENDING_ACK state' };
    }

    const pendingAck = this.persistence.getPendingAcks().get(taskId);
    if (!pendingAck || pendingAck.agentId !== agentId) {
      return { success: false, error: `ACK failed: Expected agent ${pendingAck?.agentId} but got ${agentId}` };
    }

    // Success: Transition to ASSIGNED
    // Use updateStatus to handle history/logging and assignment
    this.updateStatus(taskId, 'ASSIGNED', undefined, agentId);
    
    // Clear pending ACK flags
    this.persistence.clearPendingAck(taskId);

    console.log(`[TaskLifecycle] Task ${taskId} ACKed by ${agentId}, now ASSIGNED`);
    return { success: true };
  }
"

target = "  private persistUpdate(task: Task): void {"

if "ackTask" not in content:
    content = content.replace(target, methods + "\n" + target)

with open(file_path, 'w') as f:
    f.write(content)
print("Updated task-lifecycle-service.ts")
