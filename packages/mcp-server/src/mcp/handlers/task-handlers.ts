/**
 * Task-related tool handlers
 * Extracted from ToolHandler for better separation of concerns
 */
import { AgentRepository } from '../../state/agent-repository.js';
import { TaskQueue } from '../../state/queue.js';
import { emitDelegation } from '../../state/events.js';
import { scanPrompt, getSecurityContext } from '../../security/prompt-scanner.js';
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
      if (task?.to.agentId) {
        this.registry.heartbeat(task.to.agentId);
      }
      this.queue.updateStatus(params.taskId, params.status, {
        message: params.message,
        artifacts: params.artifacts,
        blockedReason: params.blockedReason
      });
      console.log(`[Tool] Response from task ${params.taskId}: ${params.status}`);
      return {
        content: [{ type: 'text', text: `Response recorded for ${params.taskId}` }]
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
        console.log(`[Tools] No target agent or capabilities specified, task will match any waiting agent`);
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

      const sourceAgentObj = this.registry.get(sourceAgent);
      this.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: params.prompt,
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
          isDelegation: true,
          security: getSecurityContext(process.env.WORKSPACE_ROOT || process.cwd())
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

      return {
        content: [{ type: 'text', text: `Task ${params.taskId} acknowledged` }]
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

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            taskId: task.id,
            prompt: task.prompt,
            status: task.status,
            messages,
            context: task.context,
            dependencyOutputs
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
