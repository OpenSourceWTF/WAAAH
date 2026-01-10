
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  scoreAgent, 
  findBestAgent, 
  findPendingTaskForAgent, 
  findAndReserveAgent,
  waitForTask,
  SCHEDULER_CONFIG,
  WaitingAgent
} from '../src/state/agent-matcher.js';
import { Task, StandardCapability } from '@opensourcewtf/waaah-types';

describe('Agent Matcher', () => {
  const mockTask = (overrides: Partial<Task> = {}): Task => ({
    id: 'task-1',
    status: 'QUEUED',
    command: 'test',
    prompt: 'test',
    priority: 'normal',
    from: { type: 'agent', id: 'source' },
    to: { agentId: undefined, requiredCapabilities: [] },
    context: {},
    createdAt: 1000,
    ...overrides
  } as Task);

  const mockAgent = (id: string, caps: StandardCapability[], waitingSince: number = 1000): WaitingAgent => ({
    agentId: id,
    capabilities: caps,
    waitingSince
  });

  describe('scoreAgent', () => {
    it('should score 1.0 for perfect match', () => {
      const task = mockTask({ 
        to: { requiredCapabilities: ['code-writing'], workspaceId: 'repo-1', agentId: 'agent-1' } 
      });
      const agent: WaitingAgent = {
        agentId: 'agent-1',
        capabilities: ['code-writing'],
        workspaceContext: { type: 'local', repoId: 'repo-1' },
        waitingSince: 1000
      };

      const result = scoreAgent(task, agent);
      expect(result.score).toBe(1.0);
      expect(result.eligible).toBe(true);
    });

    it('should score 0.0 if capabilities missing', () => {
      const task = mockTask({ to: { requiredCapabilities: ['code-writing'] } });
      const agent = mockAgent('agent-1', []);

      const result = scoreAgent(task, agent);
      expect(result.score).toBe(0.0);
      expect(result.eligible).toBe(false);
    });

    it('should handle neutral scores', () => {
      const task = mockTask(); // No requirements
      const agent = mockAgent('agent-1', ['code-writing']);

      const result = scoreAgent(task, agent);
      // Weights: ws(0.4)*0.5 + caps(0.4)*1.0 + hint(0.2)*0.5 = 0.2 + 0.4 + 0.1 = 0.7
      expect(result.score).toBeCloseTo(0.7);
      expect(result.eligible).toBe(true);
    });
  });

  describe('findBestAgent', () => {
    it('should select highest scoring agent', () => {
      const task = mockTask({ to: { requiredCapabilities: ['code-writing'] } });
      const a1 = mockAgent('a1', ['code-writing']); // Neutral score
      const a2 = mockAgent('a2', ['code-writing']); 
      
      // Give a2 a workspace match to boost score
      a2.workspaceContext = { type: 'local', repoId: 'repo-1' };
      task.to.workspaceId = 'repo-1';

      const result = findBestAgent(task, [a1, a2]);
      expect(result?.agentId).toBe('a2');
    });

    it('should use waitingSince as tiebreaker', () => {
      const task = mockTask();
      const a1 = mockAgent('a1', [], 2000); // Newer
      const a2 = mockAgent('a2', [], 1000); // Older

      const result = findBestAgent(task, [a1, a2]);
      expect(result?.agentId).toBe('a2');
    });
  });

  describe('findPendingTaskForAgent', () => {
    let mockQueue: any;

    beforeEach(() => {
      mockQueue = {
        getByStatuses: vi.fn(),
        updateStatus: vi.fn(),
        pendingAcks: new Map()
      };
    });

    it('should return first eligible task', () => {
      const t1 = mockTask({ id: 't1', to: { requiredCapabilities: ['test-writing'] } });
      const t2 = mockTask({ id: 't2', to: { requiredCapabilities: ['code-writing'] } });
      mockQueue.getByStatuses.mockReturnValue([t1, t2]);

      const result = findPendingTaskForAgent(mockQueue, 'a1', ['code-writing']);
      expect(result?.id).toBe('t2');
    });

    it('should respect dependencies', () => {
      const t1 = mockTask({ 
        id: 't1', 
        dependencies: ['dep-1'],
        to: { requiredCapabilities: [] } 
      });
      mockQueue.getByStatuses.mockReturnValue([t1]);

      // dep-1 not completed
      const getTask = vi.fn().mockReturnValue({ status: 'IN_PROGRESS' });
      
      const result = findPendingTaskForAgent(mockQueue, 'a1', [], undefined, getTask);
      expect(result).toBeUndefined();
    });
  });

  describe('waitForTask', () => {
    let mockQueue: any;

    beforeEach(() => {
      mockQueue = {
        popEviction: vi.fn(),
        addWaitingAgent: vi.fn(),
        removeWaitingAgent: vi.fn(),
        getByStatuses: vi.fn().mockReturnValue([]),
        pendingAcks: new Map(),
        updateStatus: vi.fn(),
        on: vi.fn(),
        off: vi.fn()
      };
    });

    it('should resolve immediately if pending task found', async () => {
      const task = mockTask();
      mockQueue.getByStatuses.mockReturnValue([task]);

      const result = await waitForTask(mockQueue, 'a1', []);
      expect((result as Task).id).toBe('task-1');
      expect(mockQueue.updateStatus).toHaveBeenCalledWith('task-1', 'PENDING_ACK');
    });

    it('should wait for event if no task', async () => {
      // Setup promise to simulate event emission
      let taskListener: any;
      mockQueue.on.mockImplementation((event: string, cb: any) => {
        if (event === 'task') taskListener = cb;
      });

      const promise = waitForTask(mockQueue, 'a1', [], undefined, 100);
      
      // Simulate event
      setTimeout(() => {
        if (taskListener) taskListener(mockTask(), 'a1');
      }, 10);

      const result = await promise;
      expect((result as Task).id).toBe('task-1');
    });
  });
});
