/**
 * Task-related tool handlers
 * Extracted from ToolHandler for better separation of concerns
 */
import { AgentRepository } from '../../state/persistence/agent-repository.js';
import { TaskQueue } from '../../state/queue.js';
import { emitDelegation } from '../../state/events.js';
import { scanPrompt } from '../../security/prompt-scanner.js';
import { inferCapabilities } from '../../scheduling/capability-inference.js';
import {
  sendResponseSchema,
  assignTaskSchema,
  ackTaskSchema,
  blockTaskSchema,
  answerTaskSchema,
  getTaskContextSchema,
  updateProgressSchema,
  toMCPError
} from '@opensourcewtf/waaah-types';

export class TaskHandlers {
  constructor(
    private registry: AgentRepository,
    private queue: TaskQueue
  ) { }

  private handleError(error: unknown) {
    console.error('[ToolError]', error);
    return toMCPError(error);
  }

  /**
   * Sends a response or status update for a task.
   */
  async send_response(args: unknown) {
    try {
      const params = sendResponseSchema.parse(args);
      const task = this.queue.getTask(params.taskId);

      // S19: Validate task exists and is in a valid state for updates
      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'Task not found' }) }],
          isError: true
        };
      }

      // S19: Reject updates from tasks that haven't been properly ACKed
      // Valid states for send_response: ASSIGNED, IN_PROGRESS, IN_REVIEW, APPROVED_QUEUED, APPROVED_PENDING_ACK
      const validStates = ['ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED_QUEUED', 'APPROVED_PENDING_ACK', 'REJECTED'];
      if (!validStates.includes(task.status)) {
        console.warn(`[Tool] ⚠️ send_response rejected: Task ${params.taskId} is ${task.status}, not properly ACKed`);
        return {
          content: [{
            type: 'text', text: JSON.stringify({
              success: false,
              error: `Task is in ${task.status} state. You must call ack_task first to transition the task to ASSIGNED before calling send_response.`
            })
          }],
          isError: true
        };
      }

      if (task?.to.agentId) {
        this.registry.heartbeat(task.to.agentId);
      }

      // S17: Validate diff for IN_REVIEW status (code/test tasks only)
      if (params.status === 'IN_REVIEW') {
        const caps = task?.to?.requiredCapabilities || [];
        const isCodeTask = caps.some(c => c.includes('code') || c.includes('test'));

        if (isCodeTask && (!params.diff || params.diff.length < 20)) {
          console.warn(`[Tool] ⚠️ IN_REVIEW without valid diff (taskId: ${params.taskId}, length: ${params.diff?.length || 0})`);
          return {
            content: [{
              type: 'text', text: JSON.stringify({
                success: false,
                error: 'Code/test tasks require a valid diff. Your diff appears empty or too short.'
              })
            }],
            isError: true
          };
        }
      }

      this.queue.updateStatus(params.taskId, params.status, {
        message: params.message,
        artifacts: params.artifacts,
        diff: params.diff, // S17: Persist raw diff
        blockedReason: params.blockedReason
      });
      console.log(`[Tool] Response from task ${params.taskId}: ${params.status}`);

      // Build response with optional cleanup prompt for COMPLETED tasks
      const response: { success: boolean; message: string; prompt?: string } = {
        success: true,
        message: `Response recorded for ${params.taskId}`
      };

      if (params.status === 'COMPLETED') {
        response.prompt = `## REQUIRED ACTION
1. Verify merged: git log origin/main --oneline | head -1
2. If not merged: git push origin feature-${params.taskId}
3. Cleanup: git worktree remove .worktrees/feature-${params.taskId} --force`;
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(response) }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Delegates a task to another agent.
   */
  async assign_task(args: unknown) {
    try {
      const params = assignTaskSchema.parse(args);
      const sourceAgent = params.sourceAgentId || 'unknown';

      if (sourceAgent !== 'unknown') {
        this.registry.heartbeat(sourceAgent);
      }

      let targetAgentId: string | undefined;
      let targetDisplayName: string | undefined;

      if (params.targetAgentId) {
        const byId = this.registry.get(params.targetAgentId);
        if (byId) {
          targetAgentId = byId.id;
          targetDisplayName = byId.displayName;
        } else {
          const byName = this.registry.getByDisplayName(params.targetAgentId);
          if (byName) {
            targetAgentId = byName.id;
            targetDisplayName = byName.displayName;
          }
        }
      }

      if (!targetAgentId && !params.requiredCapabilities?.length) {
        // Infer capabilities from prompt when not specified
        const inference = inferCapabilities(params.prompt, { spec: params.spec, tasks: params.tasks });
        params.requiredCapabilities = inference.capabilities;
        console.log(`[Tools] Inferred capabilities: [${inference.capabilities.join(', ')}] (confidence: ${inference.confidence.toFixed(2)}, fallback: ${inference.fallback})`);
      }

      const scan = scanPrompt(params.prompt);
      if (!scan.allowed) {
        console.warn(`[Security] Delegation blocked. Flags: ${scan.flags.join(', ')}`);
        return {
          content: [{ type: 'text', text: `Security: Delegation blocked. Flags: ${scan.flags.join(', ')}` }],
          isError: true
        };
      }

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const firstLine = params.prompt.split('\n')[0].trim();
      const title = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;

      // S17: Prompt Injection for deterministic worktree naming
      // We inject this MANDATORY instruction to prevent agent hallucinations.
      // S18: Handle worktree collision - resume if exists, create if not
      const branchName = `feature-${taskId}`;
      const worktreePath = `.worktrees/${branchName}`;
      const setupInstruction = `
## SETUP (MANDATORY)
Run these commands to start work:
\`\`\`bash
# Check if worktree already exists
if [ -d "${worktreePath}" ]; then
  echo "Resuming on existing worktree: ${worktreePath}"
  cd ${worktreePath}
else
  git worktree add ${worktreePath} -b ${branchName}
  cd ${worktreePath}
fi
\`\`\`
`;
      const finalPrompt = params.prompt + setupInstruction;

      const sourceAgentObj = this.registry.get(sourceAgent);
      // BACKWARD COMPATIBILITY: Lift dependencies from context if not at top-level
      // This allows 'assign_task' calls that put dependencies in context to still work with scheduler.
      if ((!params.dependencies || params.dependencies.length === 0) && params.context?.dependencies) {
        const ctxDeps = params.context.dependencies;
        if (Array.isArray(ctxDeps) && ctxDeps.every((d): d is string => typeof d === 'string')) {
          params.dependencies = ctxDeps;
          console.log(`[Tools] Lifted ${params.dependencies.length} dependencies from context to top-level for scheduler.`);
        }
      }

      this.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: finalPrompt,
        title,
        from: { type: 'agent', id: sourceAgent, name: sourceAgentObj?.displayName || sourceAgent },
        to: {
          agentId: targetAgentId,
          requiredCapabilities: params.requiredCapabilities,
          workspaceId: params.workspaceId
        },
        priority: params.priority || 'normal',
        status: 'QUEUED',
        createdAt: Date.now(),
        context: {
          ...params.context,
          isDelegation: true
          // NOTE: security context is derived from task.to.workspaceId when needed,
          // not stored redundantly here. See agent-matcher.ts for workspace routing.
        },
        dependencies: params.dependencies
      });

      const logTarget = targetAgentId
        ? `${targetDisplayName || targetAgentId}`
        : `Capabilities: [${params.requiredCapabilities?.join(', ') || 'any'}]`;
      console.log(`[Tools] ${sourceAgentObj?.displayName || sourceAgent} delegated to ${logTarget}: ${params.prompt.substring(0, 50)}...`);

      emitDelegation({
        taskId,
        from: sourceAgentObj?.displayName || sourceAgent,
        to: targetDisplayName || logTarget,
        prompt: params.prompt.length > 200 ? params.prompt.substring(0, 200) + '...' : params.prompt,
        priority: params.priority || 'normal',
        createdAt: Date.now()
      });

      return {
        content: [{ type: 'text', text: `Task delegated to ${logTarget}: ${taskId}` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Acknowledges receipt of a task.
   */
  async ack_task(args: unknown) {
    try {
      const params = ackTaskSchema.parse(args);
      this.registry.heartbeat(params.agentId);
      const result = this.queue.ackTask(params.taskId, params.agentId);

      if (!result.success) {
        return {
          content: [{ type: 'text', text: `ACK failed: ${result.error}` }],
          isError: true
        };
      }

      // Deliver any unread comments on ACK
      const unreadComments = this.queue.getUnreadComments(params.taskId);
      if (unreadComments.length > 0) {
        this.queue.markCommentsAsRead(params.taskId);
        console.log(`[Tool] Delivering ${unreadComments.length} unread comments on ACK for task ${params.taskId}`);
      }

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            acknowledged: true,
            taskId: params.taskId,
            unreadComments: unreadComments.length > 0 ? unreadComments : undefined
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Blocks the current task due to missing information or dependencies.
   */
  async block_task(args: unknown) {
    try {
      const params = blockTaskSchema.parse(args);

      this.queue.addMessage(params.taskId, 'system', `Task BLOCKED: ${params.reason.toUpperCase()} - ${params.question}`, {
        type: 'block_event',
        reason: params.reason,
        question: params.question,
        summary: params.summary,
        notes: params.notes,
        files: params.files
      });

      this.queue.updateStatus(params.taskId, 'BLOCKED', { blockedReason: params.question });

      return {
        content: [{ type: 'text', text: `Task ${params.taskId} blocked. WAAAH Bot will notify the user.` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Provides an answer to a blocked task (unblocks it).
   */
  async answer_task(args: unknown) {
    try {
      const params = answerTaskSchema.parse(args);
      this.queue.addMessage(params.taskId, 'user', params.answer);
      this.queue.updateStatus(params.taskId, 'QUEUED');

      return {
        content: [{ type: 'text', text: `Task ${params.taskId} unblocked and requeued.` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Gets full context for a task including message history.
   */
  async get_task_context(args: unknown) {
    try {
      const params = getTaskContextSchema.parse(args);
      const task = this.queue.getTask(params.taskId);
      if (!task) {
        return {
          content: [{ type: 'text', text: 'Task not found' }],
          isError: true
        };
      }

      const messages = this.queue.getMessages(params.taskId);
      const dependencyOutputs: Record<string, any> = {};
      if (task.dependencies && Array.isArray(task.dependencies)) {
        for (const depId of task.dependencies) {
          const depTask = this.queue.getTask(depId);
          if (depTask) {
            dependencyOutputs[depId] = {
              status: depTask.status,
              output: depTask.response,
              completedAt: depTask.completedAt
            };
          }
        }
      }

      // Deliver any unread comments when context is fetched
      const unreadComments = this.queue.getUnreadComments(params.taskId);
      if (unreadComments.length > 0) {
        this.queue.markCommentsAsRead(params.taskId);
        console.log(`[Tool] Delivering ${unreadComments.length} unread comments on get_task_context for task ${params.taskId}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            taskId: task.id,
            prompt: task.prompt,
            status: task.status,
            to: task.to, // Include routing info (capabilities, workspaceId)
            messages,
            context: task.context,
            dependencyOutputs,
            unreadComments: unreadComments.length > 0 ? unreadComments : undefined
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Updates progress for a task with an observation message.
   */
  async update_progress(args: unknown) {
    try {
      const params = updateProgressSchema.parse(args);

      this.registry.heartbeat(params.agentId);
      this.queue.addMessage(params.taskId, 'agent', params.message, {
        phase: params.phase,
        percentage: params.percentage,
        agentId: params.agentId,
        messageType: 'progress'
      }, true, 'progress');

      console.log(`[Tool] Progress update for ${params.taskId}: ${params.phase || 'N/A'} - ${params.message.substring(0, 50)}...`);

      const unreadComments = this.queue.getUnreadComments(params.taskId);
      if (unreadComments.length > 0) {
        this.queue.markCommentsAsRead(params.taskId);
        console.log(`[Tool] Delivering ${unreadComments.length} unread comments to agent for task ${params.taskId}`);
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            recorded: true,
            unreadComments: unreadComments.length > 0 ? unreadComments : undefined
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }
}
