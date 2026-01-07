import { AgentRegistry } from '../state/registry.js';
import { TaskQueue } from '../state/queue.js';
import { scanPrompt, getSecurityContext } from '../security/prompt-scanner.js';
import { emitDelegation, emitActivity } from '../state/events.js';

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
  createWaitForPromptSchema,
  DEFAULT_PROMPT_TIMEOUT,
  MAX_PROMPT_TIMEOUT
} from '@waaah/types';

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
  adminUpdateAgentSchema
};

/**
 * Handles incoming MCP tool requests and orchestrates interactions between the AgentRegistry and TaskQueue.
 * Implements the core logic for all exposed MCP tools.
 */
export class ToolHandler {
  constructor(
    private registry: AgentRegistry,
    private queue: TaskQueue
  ) { }

  async handleError(error: unknown) {
    console.error('[ToolError]', error);
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true
    };
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
        role: params.role,
        displayName: params.displayName || '', // Ensure string
        capabilities: params.capabilities || []
      });

      // Return permissions for this role
      const canDelegateTo = this.registry.getAllowedDelegates(params.role);

      emitActivity('AGENT', `Agent ${params.displayName || finalAgentId} connected`, {
        agentId: finalAgentId,
        role: params.role
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            registered: true,
            agentId: finalAgentId, // Use the actual ID (may have been renamed)
            displayName: params.displayName,
            role: params.role,
            canDelegateTo
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
      const role = agent?.role || 'developer';

      // Update heartbeat on each wait call (start of long-poll)
      this.registry.heartbeat(params.agentId);

      const result = await this.queue.waitForTask(params.agentId, role, timeoutMs);

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
   * Enforces role-based permissions and security scanning.
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

      // Resolve Target
      let targetAgentId: string | undefined;
      let targetRole: string | undefined; // AgentRole type
      let targetDisplayName: string | undefined;

      // 1. Try ID
      const byId = this.registry.get(params.targetAgentId);
      if (byId) {
        targetAgentId = byId.id;
        targetRole = byId.role;
        targetDisplayName = byId.displayName;
      }

      // 2. Try Display Name
      if (!targetAgentId) {
        const byName = this.registry.getByDisplayName(params.targetAgentId);
        if (byName) {
          targetAgentId = byName.id;
          targetRole = byName.role;
          targetDisplayName = byName.displayName;
        }
      }

      // 3. Try Role (Broadcast Mode)
      if (!targetAgentId) {
        // Check if the input string itself is a valid role that exists in the DB
        // getByRole returns the most recent agent, proving the role exists.
        const byRoleSample = this.registry.getByRole(params.targetAgentId);
        if (byRoleSample) {
          targetRole = byRoleSample.role; // Use the canonical role from DB
          targetDisplayName = `Role: ${targetRole}`;
          // keeping targetAgentId undefined = BROADCAST to all agents of this role
        }
      }

      if (!targetRole) {
        return {
          content: [{ type: 'text', text: `Target agent or role "${params.targetAgentId}" not found` }],
          isError: true
        };
      }

      // Enforce delegation permissions
      const sourceAgentObj = this.registry.get(sourceAgent);
      if (sourceAgentObj) {
        // We cast to any because AgentRole enum typings might be strict in the codebase 
        const canDelegate = this.registry.canDelegate(sourceAgentObj.role, targetRole as any);
        if (!canDelegate) {
          return {
            content: [{ type: 'text', text: `Permission denied: ${sourceAgentObj.role} cannot delegate to ${targetRole}` }],
            isError: true
          };
        }
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

      this.queue.enqueue({
        id: taskId,
        command: 'execute_prompt',
        prompt: params.prompt,
        from: { type: 'agent', id: sourceAgent, name: sourceAgentObj?.displayName || sourceAgent },
        to: {
          agentId: targetAgentId, // If undefined, this is a broadcase
          role: targetRole as any
        },
        priority: params.priority || 'normal',
        status: 'QUEUED',
        createdAt: Date.now(),
        context: {
          ...params.context,
          isDelegation: true,
          security: getSecurityContext(process.env.WORKSPACE_ROOT || process.cwd())
        }
      });

      const logTarget = targetAgentId ? `${targetDisplayName}` : `Role: ${targetRole} (Broadcast)`;
      console.log(`[Tools] ${sourceAgentObj?.displayName || sourceAgent} delegated to ${logTarget}: ${params.prompt.substring(0, 50)}...`);

      // Emit delegation event for real-time notifications (SSE stream)
      emitDelegation({
        taskId,
        from: sourceAgentObj?.displayName || sourceAgent,
        to: targetDisplayName || targetRole || 'Unknown',
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
   * Lists available agents, filtering by role if requested.
   * 
   * @param args - The arguments for list_agents tool (listAgentsSchema).
   * @returns MCP Tool content with list of matching agents.
   */
  async list_agents(args: unknown) {
    try {
      const params = listAgentsSchema.parse(args);
      const agents = this.registry.getAll();
      const waitingAgents = this.queue.getWaitingAgents();

      const inputs = (params.role && params.role !== 'any')
        ? agents.filter(a => a.role === params.role)
        : agents;

      const result = inputs.map(agent => {
        const assignedTasks = this.queue.getAssignedTasksForAgent(agent.id);
        const lastSeen = this.registry.getLastSeen(agent.id);
        const isRecent = lastSeen && (Date.now() - lastSeen) < 5 * 60 * 1000;
        const isWaiting = waitingAgents.includes(agent.id);

        let status: 'OFFLINE' | 'WAITING' | 'PROCESSING' = 'OFFLINE';
        if (assignedTasks.length > 0) {
          status = 'PROCESSING';
        } else if (isWaiting || isRecent) {
          status = 'WAITING';
        }

        return {
          id: agent.id,
          role: agent.role,
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
      const isRecent = lastSeen && (Date.now() - lastSeen) < 5 * 60 * 1000;

      let status: 'OFFLINE' | 'WAITING' | 'PROCESSING' = 'OFFLINE';
      if (assignedTasks.length > 0) {
        status = 'PROCESSING';
      } else if (isWaiting) {
        status = 'WAITING';
      } else if (isRecent) {
        // Recently seen but not actively waiting - might be between polls
        status = 'WAITING';
      }

      return {
        content: [{
          type: 'text', text: JSON.stringify({
            agentId: agent.id,
            displayName: agent.displayName,
            status,
            role: agent.role,
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
   * Updates an agent's metadata (displayName, color, status) via Admin API.
   * 
   * @param args - The arguments for admin_update_agent tool (adminUpdateAgentSchema).
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
   * Triggers an eviction for a specific agent.
   */
  async admin_evict_agent(args: unknown) {
    try {
      // Manual parsing or use a schema if defined in types
      // const params = adminEvictAgentSchema.parse(args); 
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

  /** List all agents with their connection status (WAITING/PROCESSING/OFFLINE) */
  async list_connected_agents(_args: unknown) {
    try {
      const agents = this.registry.getAll();
      const waitingAgents = this.queue.getWaitingAgents();

      const result = agents.map(agent => {
        const assignedTasks = this.queue.getAssignedTasksForAgent(agent.id);
        const lastSeen = this.registry.getLastSeen(agent.id);
        const isRecent = lastSeen && (Date.now() - lastSeen) < 5 * 60 * 1000;
        const isWaiting = waitingAgents.includes(agent.id);

        let status: 'OFFLINE' | 'WAITING' | 'PROCESSING' = 'OFFLINE';
        if (assignedTasks.length > 0) {
          status = 'PROCESSING';
        } else if (isWaiting || isRecent) {
          status = 'WAITING';
        }

        return {
          agentId: agent.id,
          displayName: agent.displayName,
          role: agent.role,
          status,
          lastSeen,
          currentTasks: assignedTasks.map(t => t.id)
        };
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    } catch (e) { return this.handleError(e); }
  }
}
