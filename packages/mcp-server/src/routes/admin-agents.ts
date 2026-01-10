/**
 * Admin Agent Routes
 * Handles all /admin/agents/* and eviction endpoints
 */
import { Router } from 'express';
import { AgentRepository } from '../state/agent-repository.js';
import { TaskQueue } from '../state/queue.js';
import { AGENT_OFFLINE_THRESHOLD_MS } from '@opensourcewtf/waaah-types';
import { determineAgentStatus } from '../state/agent-status.js';

interface AgentRoutesConfig {
  registry: AgentRepository;
  queue: TaskQueue;
}

export function createAgentRoutes({ registry, queue }: AgentRoutesConfig): Router {
  const router = Router();

  /**
   * GET /agents/status
   * Get all agents with their connection status
   */
  router.get('/agents/status', async (req, res) => {
    const agents = registry.getAll();
    const waitingAgents = queue.getWaitingAgents();

    const result = agents.map(agent => {
      const assignedTasks = queue.getAssignedTasksForAgent(agent.id);
      const lastSeen = registry.getLastSeen(agent.id);
      const isRecent = Boolean(lastSeen && (Date.now() - lastSeen) < AGENT_OFFLINE_THRESHOLD_MS);
      const isWaiting = waitingAgents.has(agent.id);
      const status = determineAgentStatus(assignedTasks, isWaiting, isRecent);

      return {
        id: agent.id,
        displayName: agent.displayName,
        role: agent.role || '',
        source: agent.source,
        status,
        lastSeen,
        createdAt: agent.createdAt,
        currentTasks: assignedTasks.map(t => t.id),
        capabilities: agent.capabilities || [],
        color: agent.color
      };
    });

    res.json(result);
  });

  /**
   * POST /evict
   * Queue an eviction for an agent
   */
  router.post('/evict', (req, res) => {
    const { agentId, reason, action } = req.body;
    if (!agentId || !reason) {
      res.status(400).json({ error: 'Missing agentId or reason' });
      return;
    }
    queue.queueEviction(agentId, reason, action || 'RESTART');
    res.json({ success: true, message: `Eviction queued for ${agentId}` });
  });

  /**
   * POST /agents/:agentId/evict
   * Request eviction for a specific agent
   */
  router.post('/agents/:agentId/evict', (req, res) => {
    const { agentId } = req.params;
    const { reason } = req.body;

    const success = registry.requestEviction(agentId, reason || 'Admin requested eviction');
    if (success) {
      res.json({ success: true, message: `Eviction requested for ${agentId}` });
    } else {
      res.status(404).json({ error: 'Agent not found' });
    }
  });

  return router;
}
