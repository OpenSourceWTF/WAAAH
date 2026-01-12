/**
 * Agent Matching Service Tests
 * 
 * Tests for agent-to-task matching with scored selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentMatchingService } from '../src/state/services/agent-matching-service.js';
import type { Task } from '@opensourcewtf/waaah-types';

// Helper to create task
function createTask(id: string, status: string = 'QUEUED', overrides: any = {}): Task {
  return {
    id,
    command: 'execute_prompt',
    prompt: 'Test',
    from: { type: 'user', id: 'u1', name: 'User' },
    to: {},
    priority: 'normal',
    status,
    createdAt: Date.now(),
    ...overrides
  } as Task;
}

describe('AgentMatchingService', () => {
  let service: AgentMatchingService;
  let mockRepo: any;
  let mockPersistence: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      getById: vi.fn(),
      getByStatuses: vi.fn().mockReturnValue([]),
      update: vi.fn()
    };

    mockPersistence = {
      getWaitingAgents: vi.fn().mockReturnValue(new Map()),
      setPendingAck: vi.fn(),
      clearAgentWaiting: vi.fn()
    };

    service = new AgentMatchingService(mockRepo, mockPersistence);
  });

  describe('findPendingTaskForAgent', () => {
    it('returns undefined when no tasks available', () => {
      mockRepo.getByStatuses.mockReturnValue([]);

      const result = service.findPendingTaskForAgent('agent-1', ['code-writing']);

      expect(result).toBeUndefined();
    });

    it('returns task targeted at specific agent', () => {
      const task = createTask('task-1', 'QUEUED', { to: { agentId: 'agent-1' } });
      mockRepo.getByStatuses.mockReturnValue([task]);

      const result = service.findPendingTaskForAgent('agent-1', []);

      expect(result?.id).toBe('task-1');
    });

    it('returns task with no capability requirements', () => {
      const task = createTask('task-1', 'QUEUED', { to: {} });
      mockRepo.getByStatuses.mockReturnValue([task]);

      const result = service.findPendingTaskForAgent('agent-1', ['code-writing']);

      expect(result?.id).toBe('task-1');
    });

    it('returns undefined if agent lacks required capabilities', () => {
      const task = createTask('task-1', 'QUEUED', {
        to: { requiredCapabilities: ['spec-writing'] }
      });
      mockRepo.getByStatuses.mockReturnValue([task]);

      const result = service.findPendingTaskForAgent('agent-1', ['code-writing']);

      expect(result).toBeUndefined();
    });

    it('returns task if agent has required capabilities', () => {
      const task = createTask('task-1', 'QUEUED', {
        to: { requiredCapabilities: ['code-writing'] }
      });
      mockRepo.getByStatuses.mockReturnValue([task]);

      const result = service.findPendingTaskForAgent('agent-1', ['code-writing', 'test-writing']);

      expect(result?.id).toBe('task-1');
    });

    it('prioritizes tasks previously assigned to this agent', () => {
      const task1 = createTask('task-1', 'QUEUED', { priority: 'normal' });
      const task2 = createTask('task-2', 'QUEUED', { priority: 'normal', assignedTo: 'agent-1' });
      mockRepo.getByStatuses.mockReturnValue([task1, task2]);

      const result = service.findPendingTaskForAgent('agent-1', ['code-writing']);

      expect(result?.id).toBe('task-2'); // Affinity prioritized
    });

    it('prioritizes higher priority tasks', () => {
      const normal = createTask('normal', 'QUEUED', { priority: 'normal' });
      const critical = createTask('critical', 'QUEUED', { priority: 'critical' });
      mockRepo.getByStatuses.mockReturnValue([normal, critical]);

      const result = service.findPendingTaskForAgent('agent-1', ['code-writing']);

      expect(result?.id).toBe('critical');
    });
  });

  describe('reserveAgentForTask', () => {
    it('returns null when no waiting agents', () => {
      mockPersistence.getWaitingAgents.mockReturnValue(new Map());
      const task = createTask('task-1', 'QUEUED');

      const result = service.reserveAgentForTask(task);

      expect(result).toBeNull();
    });

    it('reserves matching waiting agent', () => {
      mockPersistence.getWaitingAgents.mockReturnValue(new Map([
        ['agent-1', {
          capabilities: ['code-writing'],
          workspaceContext: { type: 'github', repoId: 'test-repo' }
        }]
      ]));
      const task = createTask('task-1', 'QUEUED', { to: { requiredCapabilities: ['code-writing'] } });

      const result = service.reserveAgentForTask(task);

      expect(result).toBe('agent-1');
      expect(task.status).toBe('PENDING_ACK');
      expect(mockRepo.update).toHaveBeenCalledWith(task);
      expect(mockPersistence.setPendingAck).toHaveBeenCalledWith('task-1', 'agent-1');
      expect(mockPersistence.clearAgentWaiting).toHaveBeenCalledWith('agent-1');
    });

    it('returns null when no agent has required capabilities', () => {
      mockPersistence.getWaitingAgents.mockReturnValue(new Map([
        ['agent-1', {
          capabilities: ['code-writing'],
          workspaceContext: { type: 'github', repoId: 'test-repo' }
        }]
      ]));
      const task = createTask('task-1', 'QUEUED', { to: { requiredCapabilities: ['spec-writing'] } });

      const result = service.reserveAgentForTask(task);

      expect(result).toBeNull();
    });

    it('selects preferred agent via hint score', () => {
      mockPersistence.getWaitingAgents.mockReturnValue(new Map([
        ['agent-1', {
          capabilities: ['code-writing'],
          workspaceContext: { type: 'github', repoId: 'test-repo' }
        }],
        ['preferred-agent', {
          capabilities: ['code-writing'],
          workspaceContext: { type: 'github', repoId: 'test-repo' }
        }]
      ]));
      const task = createTask('task-1', 'QUEUED', {
        to: { agentId: 'preferred-agent', requiredCapabilities: ['code-writing'] }
      });

      const result = service.reserveAgentForTask(task);

      expect(result).toBe('preferred-agent');
    });

    it('adds history entry on reservation', () => {
      mockPersistence.getWaitingAgents.mockReturnValue(new Map([
        ['agent-1', {
          capabilities: ['code-writing'],
          workspaceContext: { type: 'github', repoId: 'test-repo' }
        }]
      ]));
      const task = createTask('task-1', 'QUEUED') as any;

      service.reserveAgentForTask(task);

      expect(task.history).toHaveLength(1);
      expect(task.history[0].status).toBe('PENDING_ACK');
      expect(task.history[0].message).toContain('agent-1');
    });
  });
});
