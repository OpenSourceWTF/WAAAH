/**
 * Agent Handlers Tests
 * 
 * Tests for agent registration and management handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentHandlers } from '../src/mcp/handlers/agent-handlers.js';

// Mock events
vi.mock('../src/state/events.js', () => ({
  emitActivity: vi.fn()
}));

describe('AgentHandlers', () => {
  let handlers: AgentHandlers;
  let mockRegistry: any;
  let mockQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = {
      register: vi.fn().mockReturnValue('agent-1'),
      getAll: vi.fn().mockReturnValue([
        { id: 'agent-1', displayName: '@Agent1', capabilities: ['code-writing'] }
      ]),
      get: vi.fn().mockReturnValue({ id: 'agent-1', displayName: '@Agent1', capabilities: [] }),
      getLastSeen: vi.fn().mockReturnValue(Date.now()),
      updateAgent: vi.fn().mockReturnValue(true)
    };

    mockQueue = {
      getWaitingAgents: vi.fn().mockReturnValue(new Map()),
      getAssignedTasksForAgent: vi.fn().mockReturnValue([]),
      isAgentWaiting: vi.fn().mockReturnValue(false),
      queueEviction: vi.fn()
    };

    handlers = new AgentHandlers(mockRegistry, mockQueue);
  });

  describe('generateDisplayName', () => {
    it('generates name in adjective-noun-number format', () => {
      const name = handlers.generateDisplayName();

      expect(name).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);
    });
  });

  describe('register_agent', () => {
    it('registers agent with provided details', async () => {
      const result = await handlers.register_agent({
        agentId: 'agent-1',
        displayName: '@TestAgent',
        capabilities: ['code-writing'],
        workspaceContext: {
          type: 'github',
          repoId: 'OpenSourceWTF/WAAAH'
        }
      });

      expect(mockRegistry.register).toHaveBeenCalled();
      expect(result.content[0].text).toContain('registered');
    });

    it('generates display name if not provided', async () => {
      const result = await handlers.register_agent({
        agentId: 'agent-2',
        capabilities: ['code-writing'],
        workspaceContext: {
          type: 'github',
          repoId: 'OpenSourceWTF/WAAAH'
        }
      });

      expect(result.content[0].text).toContain('agent');
    });

    it('returns error for invalid args', async () => {
      const result = await handlers.register_agent({});

      expect((result as any).isError).toBe(true);
    });
  });

  describe('list_agents', () => {
    it('lists all agents', async () => {
      const result = await handlers.list_agents({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('agent-1');
    });

    it('filters by capability', async () => {
      const result = await handlers.list_agents({ capability: 'code-writing' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);
    });
  });

  describe('get_agent_status', () => {
    it('returns agent status', async () => {
      const result = await handlers.get_agent_status({ agentId: 'agent-1' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.agentId).toBe('agent-1');
      expect(parsed.displayName).toBe('@Agent1');
    });

    it('returns error for unknown agent', async () => {
      mockRegistry.get.mockReturnValueOnce(undefined);

      const result = await handlers.get_agent_status({ agentId: 'unknown' });

      expect((result as any).isError).toBe(true);
    });
  });

  describe('admin_update_agent', () => {
    it('updates agent metadata', async () => {
      const result = await handlers.admin_update_agent({
        agentId: 'agent-1',
        metadata: { displayName: '@NewName' }
      });

      expect(result.content[0].text).toContain('Updated');
      expect(mockRegistry.updateAgent).toHaveBeenCalled();
    });

    it('returns error for non-existent agent', async () => {
      mockRegistry.updateAgent.mockReturnValueOnce(false);

      const result = await handlers.admin_update_agent({
        agentId: 'nonexistent',
        metadata: {}
      });

      expect((result as any).isError).toBe(true);
    });
  });

  describe('admin_evict_agent', () => {
    it('queues eviction for agent', async () => {
      const result = await handlers.admin_evict_agent({
        agentId: 'agent-1',
        reason: 'Testing eviction'
      });

      expect(result.content[0].text).toContain('Eviction queued');
      expect(mockQueue.queueEviction).toHaveBeenCalledWith('agent-1', 'Testing eviction', 'RESTART');
    });

    it('returns error for missing params', async () => {
      const result = await handlers.admin_evict_agent({});

      expect((result as any).isError).toBe(true);
    });
  });
});
