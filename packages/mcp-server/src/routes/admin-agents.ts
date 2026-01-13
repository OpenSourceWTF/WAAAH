/**
 * Admin Agent Routes
 * Handles all /admin/agents/* and eviction endpoints
 */
import { Router } from 'express';
import { AgentRepository } from '../state/persistence/agent-repository.js';
import { TaskQueue } from '../state/queue.js';
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
      const isWaiting = waitingAgents.has(agent.id);
      const status = determineAgentStatus(assignedTasks, isWaiting);

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
        color: agent.color,
        workspaceContext: agent.workspaceContext
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

  /**
   * GET /workspaces
   * Get deduplicated list of workspace roots from all agents
   */
  router.get('/workspaces', (req, res) => {
    const agents = registry.getAll();

    // Collect workspace identifiers from agents using canonical workspaceContext
    const workspaceSet = new Set<string>();
    for (const agent of agents) {
      // Use workspaceContext.path (local path) or workspaceContext.repoId (GitHub format)
      const workspace = agent.workspaceContext?.path || agent.workspaceContext?.repoId;
      if (workspace && typeof workspace === 'string') {
        workspaceSet.add(workspace);
      }
    }

    // Convert to array of objects with metadata
    const workspaces = Array.from(workspaceSet).map(path => ({
      path,
      agentCount: agents.filter(a =>
        a.workspaceContext?.path === path ||
        a.workspaceContext?.repoId === path
      ).length
    }));

    res.json(workspaces);
  });

  /**
   * GET /workspaces/:workspaceId/capabilities
   * Get aggregated capabilities for agents in a specific workspace
   */
  router.get('/workspaces/:workspaceId/capabilities', (req, res) => {
    const { workspaceId } = req.params;
    const decodedPath = decodeURIComponent(workspaceId);

    const agents = registry.getAll();

    // Find agents in this workspace using canonical workspaceContext
    const workspaceAgents = agents.filter(agent =>
      agent.workspaceContext?.path === decodedPath ||
      agent.workspaceContext?.repoId === decodedPath
    );

    if (workspaceAgents.length === 0) {
      res.status(404).json({ error: 'No agents found in workspace' });
      return;
    }

    // Aggregate capabilities from all agents in workspace
    const capabilitySet = new Set<string>();
    for (const agent of workspaceAgents) {
      const caps = agent.capabilities || [];
      for (const cap of caps) {
        capabilitySet.add(cap);
      }
    }

    const capabilities = Array.from(capabilitySet);

    res.json({
      capabilities,
      hasSpecWriting: capabilities.includes('spec-writing') || capabilities.includes('doc-writing'),
      hasCodeWriting: capabilities.includes('code-writing')
    });
  });

  return router;
}
