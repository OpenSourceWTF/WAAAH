import { AgentRepository } from '../state/agent-repository.js';
import { TaskQueue } from '../state/queue.js';
import { scanPrompt, getSecurityContext } from '../security/prompt-scanner.js';
import { emitDelegation, emitActivity } from '../state/events.js';
import { determineAgentStatus } from '../state/agent-status.js';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = util.promisify(exec);

// Import shared schemas from types package
import {
  registerAgentSchema,
  // waitForPromptSchema, // We create this one dynamically
  waitForTaskSchema,
  sendResponseSchema,
  assignTaskSchema,
  listAgentsSchema,
  getAgentStatusSchema,
  ackTaskSchema,
  adminUpdateAgentSchema,
  blockTaskSchema,
  answerTaskSchema,
  getTaskContextSchema,
  AGENT_OFFLINE_THRESHOLD_MS,
  createWaitForPromptSchema,
  DEFAULT_PROMPT_TIMEOUT,
  MAX_PROMPT_TIMEOUT,
  toMCPError,

  updateProgressSchema,
  scaffoldPlanSchema,
  submitReviewSchema
} from '@opensourcewtf/waaah-types';

// Parse timeout from env (default to types default)
const PROMPT_TIMEOUT = process.env.WAAAH_PROMPT_TIMEOUT
  ? parseInt(process.env.WAAAH_PROMPT_TIMEOUT, 10)
  : DEFAULT_PROMPT_TIMEOUT;

const waitForPromptSchema = createWaitForPromptSchema(PROMPT_TIMEOUT, MAX_PROMPT_TIMEOUT);

// Re-export for backward compatibility if needed
export {
  registerAgentSchema,
  waitForPromptSchema,
  sendResponseSchema,
  assignTaskSchema,
  listAgentsSchema,
  getAgentStatusSchema,
  ackTaskSchema,
  adminUpdateAgentSchema,

};

/**
 * Handles incoming MCP tool requests and orchestrates interactions between the AgentRegistry and TaskQueue.
 * Implements the core logic for all exposed MCP tools.
 */
export class ToolHandler {
  constructor(
    private registry: AgentRepository,
    private queue: TaskQueue
  ) { }

  async handleError(error: unknown) {
    console.error('[ToolError]', error);
    return toMCPError(error);
  }

  /**
   * Registers a new agent with the system.
   * 
   * @param args - The arguments for the register_agent tool (registerAgentSchema).
   * @returns MCP Tool content with registration details.
   */
  async register_agent(args: unknown) {
    try {
      const params = registerAgentSchema.parse(args);
      const finalAgentId = this.registry.register({
        id: params.agentId || `agent-${Date.now()}`,
        displayName: params.displayName || '',
        capabilities: params.capabilities,
        workspaceContext: params.workspaceContext
      });

      emitActivity('AGENT', `Agent ${params.displayName || finalAgentId} connected`, {
        agentId: finalAgentId,
        capabilities: params.capabilities
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            registered: true,
            agentId: finalAgentId,
            displayName: params.displayName,
            capabilities: params.capabilities
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * LONG-POLLING implementation for agents to wait for new tasks.
   * Agents call this to signal availability. It blocks until a task is available or timeout occurs.
   * 
   * @param args - The arguments for wait_for_prompt tool (waitForPromptSchema).
   * @returns MCP Tool content with new task details or TIMEOUT status.
   */
  async wait_for_prompt(args: unknown) {
    try {
      const params = waitForPromptSchema.parse(args);
      // Default timeout: 290s (Antigravity has 300s hard limit)
      const timeoutMs = (params.timeout ?? 290) * 1000;
      console.log(`[Tool] Agent ${params.agentId} waiting for prompt (timeout: ${timeoutMs / 1000}s)...`);

      const agent = this.registry.get(params.agentId);
      const capabilities = agent?.capabilities || ['code-writing' as const];

      // Update heartbeat on each wait call (start of long-poll)
      this.registry.heartbeat(params.agentId);

      const result = await this.queue.waitForTask(params.agentId, capabilities, timeoutMs);

      // Update heartbeat again after wait completes (maintains "recent" status
      // during the gap before the agent calls wait_for_prompt again)
      this.registry.heartbeat(params.agentId);

      if (!result) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'TIMEOUT' }) }]
        };
      }

      // Check if it's an Eviction Signal
      if ('controlSignal' in result && result.controlSignal === 'EVICT') {
        return {
          content: [{
            type: 'text', text: JSON.stringify(result)
          }]
        };
      }

      // Check if it's a System Prompt
      if ('controlSignal' in result && (result as any).controlSignal === 'SYSTEM_PROMPT') {
        return {
          content: [{
            type: 'text', text: JSON.stringify(result)
          }]
        };
      }

      // It's a Task
      const task = result as any; // Cast to Task
      return {
        content: [{
          type: 'text', text: JSON.stringify({
            taskId: task.id,
            prompt: task.prompt,
            from: task.from,
            priority: task.priority,
            context: task.context
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Waits for a specific task to complete.
   * Used by agents to block execution until a dependency task is finished.
   * 
   * @param args - The arguments for wait_for_task tool (waitForTaskSchema).
   * @returns MCP Tool content with task completion status.
   */
  async wait_for_task(args: unknown) {
    try {
      const params = waitForTaskSchema.parse(args);
      const timeoutMs = (params.timeout ?? 300) * 1000;
      console.log(`[Tool] Waiting for task ${params.taskId} to complete (timeout: ${timeoutMs / 1000}s)...`);

      const task = await this.queue.waitForTaskCompletion(params.taskId, timeoutMs);

      if (!task) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'NOT_FOUND', taskId: params.taskId }) }],
          isError: true
        };
      }

      const isComplete = ['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status);

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            taskId: task.id,
            status: task.status,
            completed: isComplete,
            response: task.response
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Sends a response or status update for a task.
   * 
   * @param args - The arguments for send_response tool (sendResponseSchema).
   * @returns MCP Tool content confirming response receipt.
   */
  async send_response(args: unknown) {
    try {
      const params = sendResponseSchema.parse(args);
      // Get the task to find the agent and update heartbeat
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
   * Uses capability-based matching.
   * 
   * @param args - The arguments for assign_task tool (assignTaskSchema).
   * @returns MCP Tool content with the new delegated task ID.
   */
  async assign_task(args: unknown) {
    try {
      const params = assignTaskSchema.parse(args);
      const sourceAgent = params.sourceAgentId || 'unknown';

      // Update heartbeat for the source agent
      if (sourceAgent !== 'unknown') {
        this.registry.heartbeat(sourceAgent);
      }

      // Resolve Target Agent (optional - if not provided, uses requiredCapabilities for matching)
      let targetAgentId: string | undefined;
      let targetDisplayName: string | undefined;

      // 1. Try ID (if targetAgentId is provided)
      if (params.targetAgentId) {
        const byId = this.registry.get(params.targetAgentId);
        if (byId) {
          targetAgentId = byId.id;
          targetDisplayName = byId.displayName;
        } else {
          // 2. Try Display Name
          const byName = this.registry.getByDisplayName(params.targetAgentId);
          if (byName) {
            targetAgentId = byName.id;
            targetDisplayName = byName.displayName;
          }
        }
      }

      // If no specific target, task will be assigned based on requiredCapabilities
      if (!targetAgentId && !params.requiredCapabilities?.length) {
        // Default to any agent if no target and no capabilities specified
        console.log(`[Tools] No target agent or capabilities specified, task will match any waiting agent`);
      }

      // Security: Scan prompt for attacks
      const scan = scanPrompt(params.prompt);
      if (!scan.allowed) {
        console.warn(`[Security] Delegation blocked. Flags: ${scan.flags.join(', ')}`);
        return {
          content: [{ type: 'text', text: `Security: Delegation blocked. Flags: ${scan.flags.join(', ')}` }],
          isError: true
        };
      }

      const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Auto-generate title from first line of prompt (max 80 chars)
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

      // Emit delegation event for real-time notifications (SSE stream)
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
   * Lists available agents, filtering by capability if requested.
   * 
   * @param args - The arguments for list_agents tool (listAgentsSchema).
   * @returns MCP Tool content with list of matching agents.
   */
  async list_agents(args: unknown) {
    try {
      const params = listAgentsSchema.parse(args);
      const agents = this.registry.getAll();
      const waitingAgents = this.queue.getWaitingAgents();

      const inputs = params.capability
        ? agents.filter(a => a.capabilities?.includes(params.capability!))
        : agents;

      const result = inputs.map(agent => {
        const assignedTasks = this.queue.getAssignedTasksForAgent(agent.id);
        const lastSeen = this.registry.getLastSeen(agent.id);
        const isRecent = Boolean(lastSeen && (Date.now() - lastSeen) < AGENT_OFFLINE_THRESHOLD_MS);
        const isWaiting = waitingAgents.has(agent.id);
        const status = determineAgentStatus(assignedTasks, isWaiting, isRecent);

        return {
          id: agent.id,
          displayName: agent.displayName,
          capabilities: agent.capabilities,
          lastSeen,
          status,
          currentTask: assignedTasks[0]?.id
        };
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Gets detailed status logic for a specific agent.
   * 
   * @param args - The arguments for get_agent_status tool (getAgentStatusSchema).
   * @returns MCP Tool content with agent status details.
   */
  async get_agent_status(args: unknown) {
    try {
      const params = getAgentStatusSchema.parse(args);
      const agent = this.registry.get(params.agentId);

      if (!agent) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ status: 'UNKNOWN' }) }],
          isError: true
        };
      }

      // Determine connection status
      const isWaiting = this.queue.isAgentWaiting(params.agentId);
      const assignedTasks = this.queue.getAssignedTasksForAgent(params.agentId);
      const lastSeen = this.registry.getLastSeen(params.agentId);
      const isRecent = Boolean(lastSeen && (Date.now() - lastSeen) < AGENT_OFFLINE_THRESHOLD_MS);
      const status = determineAgentStatus(assignedTasks, isWaiting, isRecent);

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            agentId: agent.id,
            displayName: agent.displayName,
            status,
            capabilities: agent.capabilities,
            lastSeen,
            currentTasks: assignedTasks.map(t => t.id)
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Acknowledges receipt of a task.
   * Required for the 3-loop handshake (wait -> ack -> execute).
   * 
   * @param args - The arguments for ack_task tool (ackTaskSchema).
   * @returns MCP Tool content confirming acknowledgment.
   */
  async ack_task(args: unknown) {
    try {
      const params = ackTaskSchema.parse(args);
      // Update heartbeat when agent acknowledges a task
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
   * @param args - The arguments for admin_update_agent tool(adminUpdateAgentSchema).
   * @returns MCP Tool content confirming update.
   */
  async admin_update_agent(args: unknown) {
    try {
      const params = adminUpdateAgentSchema.parse(args);
      const updates: any = {};
      if (params.status) updates.status = params.status;
      if (params.metadata?.displayName) updates.displayName = params.metadata.displayName as string;
      if (params.metadata?.color) updates.color = params.metadata.color as string;

      const success = this.registry.updateAgent(params.agentId, updates);

      if (!success) {
        return {
          content: [{ type: 'text', text: `Agent ${params.agentId} not found` }],
          isError: true
        };
      }

      return {
        content: [{ type: 'text', text: `Updated agent ${params.agentId}` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Blocks the current task due to missing information or dependencies.
   */
  async block_task(args: unknown) {
    try {
      const params = blockTaskSchema.parse(args);

      // Add system message with block details
      this.queue.addMessage(params.taskId, 'system', `Task BLOCKED: ${params.reason.toUpperCase()} - ${params.question}`, {
        type: 'block_event',
        reason: params.reason,
        question: params.question,
        summary: params.summary,
        notes: params.notes,
        files: params.files
      });

      // Update task status to BLOCKED with the reason
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

      // Add user message with the answer
      this.queue.addMessage(params.taskId, 'user', params.answer);

      // Unblock: Set status back to QUEUED
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

      // Context Injection: Auto-hydrate dependencies
      const dependencyOutputs: Record<string, any> = {};
      if (task.dependencies && Array.isArray(task.dependencies)) {
        for (const depId of task.dependencies) {
          const depTask = this.queue.getTask(depId);
          if (depTask) {
            dependencyOutputs[depId] = {
              status: depTask.status,
              output: depTask.response, // Injected output
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
            dependencyOutputs // New Field
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Triggers an eviction for a specific agent.
   */
  async admin_evict_agent(args: unknown) {
    try {
      // Reuse the partial schema or define one. For now manual check for simple args.
      const params = args as any;
      if (!params.agentId || !params.reason) {
        return {
          content: [{ type: 'text', text: 'Missing agentId or reason' }],
          isError: true
        };
      }

      this.queue.queueEviction(params.agentId, params.reason, params.action || 'RESTART');
      return {
        content: [{ type: 'text', text: `Eviction queued for ${params.agentId}` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Generates a standard implementation plan template.
   */
  async scaffold_plan(args: unknown) {
    try {
      const params = scaffoldPlanSchema.parse(args);
      const template = `# Implementation Plan - ${params.taskId}

## Goal Description
[Brief description of the goal]

## User Review Required
> [!IMPORTANT]
> [List critical items requiring user attention]

## Proposed Changes
### [Component Name]
#### [MODIFY] [filename]

## Verification Plan
### Automated Tests
- [ ] Command: \`pnpm test\`
- [ ] Unit Test: ...

### Manual Verification
- [ ] Scenario: ...
`;

      return {
        content: [{ type: 'text', text: template }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Submits code for review (Format -> Commit -> Test -> Submit).
   */
  async submit_review(args: unknown) {
    try {
      const params = submitReviewSchema.parse(args);
      const worktreePath = path.resolve(process.cwd(), '.worktrees', `feature-${params.taskId}`);

      if (!fs.existsSync(worktreePath)) {
        return { isError: true, content: [{ type: 'text', text: `Worktree for ${params.taskId} not found. Expected at ${worktreePath}` }] };
      }

      console.log(`[Tool] Submitting review for ${params.taskId}`);

      // 1. Format
      console.log('- Formatting...');
      await execAsync('pnpm format', { cwd: worktreePath });

      // 2. Commit
      console.log('- Committing...');
      try {
        await execAsync('git add .', { cwd: worktreePath });
        // Check if there are changes to commit
        const status = await execAsync('git status --porcelain', { cwd: worktreePath });
        if (status.stdout.trim()) {
          await execAsync(`git commit -m "${params.message}"`, { cwd: worktreePath });
        } else {
          console.log('  (No changes to commit)');
        }
      } catch (e) {
        console.error('Commit failed:', e);
        throw e; // specific error handling can be improved
      }

      // 3. Test
      if (params.runTests) {
        console.log('- Testing...');
        try {
          await execAsync('pnpm test', { cwd: worktreePath });
        } catch (e: any) {
          console.error('Tests failed');
          return { isError: true, content: [{ type: 'text', text: `TESTS FAILED for ${params.taskId}:\n\n${e.stdout}\n\n${e.stderr}\n\nSubmission ABORTED. Please fix tests.` }] };
        }
      }

      // 4. Push
      console.log('- Pushing...');
      const branchName = `feature/${params.taskId}`;
      await execAsync(`git push origin ${branchName}`, { cwd: worktreePath });

      // 5. Update Status
      console.log('- Updating Status...');
      this.queue.updateStatus(params.taskId, 'IN_REVIEW');

      return {
        content: [{ type: 'text', text: `Success: Task ${params.taskId} submitted for review on branch ${branchName}.` }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Updates progress for a task with an observation message.
   * Serves as both a timeline update and an agent heartbeat.
   * 
   * @param args - The arguments for update_progress tool (updateProgressSchema).
   * @returns MCP Tool content confirming progress recorded.
   */
  async update_progress(args: unknown) {
    try {
      const params = updateProgressSchema.parse(args);

      // Update agent heartbeat
      this.registry.heartbeat(params.agentId);

      // Add message to task timeline
      this.queue.addMessage(params.taskId, 'agent', params.message, {
        phase: params.phase,
        percentage: params.percentage,
        agentId: params.agentId
      });

      console.log(`[Tool] Progress update for ${params.taskId}: ${params.phase || 'N/A'} - ${params.message.substring(0, 50)}...`);

      return {
        content: [{ type: 'text', text: 'Progress recorded' }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Broadcasts a system prompt to agents.
   */
  async broadcast_system_prompt(args: unknown) {
    try {
      const { broadcastSystemPromptSchema } = await import('@opensourcewtf/waaah-types');
      const params = broadcastSystemPromptSchema.parse(args);

      const targetAgents: string[] = [];

      if (params.broadcast) {
        const allAgents = this.registry.getAll();
        targetAgents.push(...allAgents.map((a: { id: string }) => a.id));
      } else if (params.targetCapability) {
        const capAgents = this.registry.getAll().filter((a: { capabilities?: string[] }) =>
          a.capabilities?.includes(params.targetCapability!)
        );
        targetAgents.push(...capAgents.map((a: { id: string }) => a.id));
      } else if (params.targetAgentId) {
        targetAgents.push(params.targetAgentId);
      }

      if (targetAgents.length === 0) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'No agents matched' }) }]
        };
      }

      for (const agentId of targetAgents) {
        this.queue.queueSystemPrompt(agentId, params.promptType, params.message, params.payload, params.priority);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, targetCount: targetAgents.length, targets: targetAgents }) }]
      };
    } catch (e) { return this.handleError(e); }
  }
}
