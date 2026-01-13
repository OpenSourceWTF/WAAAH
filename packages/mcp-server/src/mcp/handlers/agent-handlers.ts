/**
 * Agent-related tool handlers
 * Extracted from ToolHandler for better separation of concerns
 */
import { AgentRepository } from '../../state/persistence/agent-repository.js';
import { TaskQueue } from '../../state/queue.js';
import { emitActivity } from '../../state/events.js';
import { determineAgentStatus } from '../../state/agent-status.js';
import {
  registerAgentSchema,
  listAgentsSchema,
  getAgentStatusSchema,
  adminUpdateAgentSchema,
  toMCPError
} from '@opensourcewtf/waaah-types';

export class AgentHandlers {
  constructor(
    private registry: AgentRepository,
    private queue: TaskQueue
  ) { }

  private handleError(error: unknown) {
    console.error('[ToolError]', error);
    return toMCPError(error);
  }

  /**
   * Generate a random display name in adjective-noun-num format (S11).
   */
  generateDisplayName(): string {
    const adjectives = ['methodical', 'diligent', 'swift', 'careful', 'eager', 'steady', 'clever', 'precise'];
    const nouns = ['builder', 'coder', 'worker', 'crafter', 'maker', 'thinker', 'solver', 'agent'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}-${noun}-${num.toString().padStart(2, '0')}`;
  }

  /**
   * Registers a new agent with the system.
   */
  async register_agent(args: unknown) {
    try {
      const params = registerAgentSchema.parse(args);
      const displayName = params.displayName || this.generateDisplayName();

      const finalAgentId = this.registry.register({
        id: params.agentId || `agent-${Date.now()}`,
        displayName,
        role: params.role,
        capabilities: params.capabilities,
        workspaceContext: params.workspaceContext
      });

      emitActivity('AGENT', `Agent ${displayName} connected`, {
        agentId: finalAgentId,
        capabilities: params.capabilities
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            registered: true,
            agentId: finalAgentId,
            displayName,
            capabilities: params.capabilities
          })
        }]
      };
    } catch (e) { return this.handleError(e); }
  }

  /**
   * Lists available agents, filtering by capability if requested.
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
        const isWaiting = waitingAgents.has(agent.id);
        const status = determineAgentStatus(assignedTasks, isWaiting);

        return {
          id: agent.id,
          displayName: agent.displayName,
          role: agent.role,
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
   * Gets detailed status for a specific agent.
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

      const isWaiting = this.queue.isAgentWaiting(params.agentId);
      const assignedTasks = this.queue.getAssignedTasksForAgent(params.agentId);
      const lastSeen = this.registry.getLastSeen(params.agentId);
      const status = determineAgentStatus(assignedTasks, isWaiting);

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
   * Updates agent metadata (admin only).
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
}
