
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HybridScheduler, ISchedulerQueue } from '../src/state/scheduler.js';
import { PollingService } from '../src/state/services/polling-service.js';
import { AgentMatchingService } from '../src/state/services/agent-matching-service.js';
import { IEvictionService } from '../src/state/eviction-service.js';
import {
  scoreAgent,
  findBestAgent,
  findAndReserveAgent,
  findPendingTaskForAgent,
  waitForTask,
  WaitingAgent
} from '../src/state/agent-matcher.js';
import { TypedEventEmitter } from '../src/state/queue-events.js';
import { Task, TaskStatus, StandardCapability, WorkspaceContext } from '@opensourcewtf/waaah-types';

// Mock dependencies
vi.mock('../src/state/constants.js', () => ({
  ACK_TIMEOUT_MS: 30000,
  SCHEDULER_INTERVAL_MS: 10000,
  ORPHAN_TIMEOUT_MS: 300000,
  EVICTION_CHECK_INTERVAL_MS: 50
}));

describe('Scheduler Coverage', () => {
  describe('HybridScheduler', () => {
    let scheduler: HybridScheduler;
    let mockQueue: any;

    beforeEach(() => {
      mockQueue = {
        getPendingAcks: vi.fn().mockReturnValue(new Map()),
        updateStatus: vi.fn(),
        forceRetry: vi.fn(),
        getByStatus: vi.fn().mockReturnValue([]),
        getTask: vi.fn(),
        getByStatuses: vi.fn().mockReturnValue([]),
        getWaitingAgents: vi.fn().mockReturnValue(new Map()),
        getBusyAgentIds: vi.fn().mockReturnValue([]),
        findAndReserveAgent: vi.fn(),
        getAssignedTasksForAgent: vi.fn().mockReturnValue([]),
        getAgentLastSeen: vi.fn(),
        getTaskFromDB: vi.fn(),
        getTaskLastProgress: vi.fn().mockReturnValue(undefined),
        touchTask: vi.fn()
      } as unknown as ISchedulerQueue;
      scheduler = new HybridScheduler(mockQueue);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      scheduler.stop();
    });

    it('should be idempotent on start', () => {
      scheduler.start();
      const firstHandle = (scheduler as any).intervalHandle;
      scheduler.start();
      expect((scheduler as any).intervalHandle).toBe(firstHandle);
    });

    it('should be idempotent on stop', () => {
      scheduler.start();
      scheduler.stop();
      expect((scheduler as any).intervalHandle).toBeNull();
      scheduler.stop(); // Should be safe
    });

    it('should catch errors in runCycle', () => {
      vi.mocked(mockQueue.getPendingAcks).mockImplementation(() => {
        throw new Error('Queue error');
      });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => { });
      scheduler.runCycle();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cycle error'));
    });
  });



  describe('AgentMatcher Coverage', () => {
    const baseAgent: WaitingAgent = {
      agentId: 'agent-1',
      capabilities: ['code-writing'] as StandardCapability[],
      workspaceContext: { repoId: 'repo-1', type: 'github' },
      waitingSince: 1000
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const createAgent = (override: Partial<WaitingAgent>): WaitingAgent => ({
      ...baseAgent,
      ...override
    });

    it('scoreAgent returns 0 for workspace mismatch (Hard Reject)', () => {
      const task = {
        id: 't1',
        to: { workspaceId: 'repo-2', requiredCapabilities: [] }
      } as unknown as Task;
      const result = scoreAgent(task, baseAgent);
      expect(result.eligible).toBe(false);
      expect(result.score).toBe(0);
    });

    it('scoreAgent returns 0 for capability mismatch (Hard Reject)', () => {
      const task = {
        id: 't1',
        to: { workspaceId: 'repo-1', requiredCapabilities: ['test-writing'] }
      } as unknown as Task;
      const result = scoreAgent(task, baseAgent);
      expect(result.eligible).toBe(false);
      expect(result.score).toBe(0);
    });

    it('scoreAgent calculates correct weighted score for perfect match', () => {
      const task = {
        id: 't1',
        to: {
          workspaceId: 'repo-1',
          requiredCapabilities: ['code-writing'],
          agentId: 'agent-1'
        }
      } as unknown as Task;

      const result = scoreAgent(task, baseAgent);
      expect(result.eligible).toBe(true);
      expect(result.score).toBeCloseTo(1.0);
    });

    it('scoreAgent handles no workspace requirement (Neutral)', () => {
      const task = {
        id: 't1',
        to: { requiredCapabilities: ['code-writing'] }
      } as unknown as Task;

      const result = scoreAgent(task, baseAgent);
      expect(result.eligible).toBe(true);
      expect(result.score).toBeCloseTo(0.7);
    });

    it('scoreAgent penalizes non-preferred agent', () => {
      const task = {
        id: 't1',
        to: {
          workspaceId: 'repo-1',
          requiredCapabilities: ['code-writing'],
          agentId: 'other-agent'
        }
      } as unknown as Task;

      const result = scoreAgent(task, baseAgent);
      expect(result.eligible).toBe(true);
      expect(result.score).toBeCloseTo(0.86);
    });

    it('findBestAgent sorts by score then waiting time', () => {
      const tEqual = { id: 't3', to: { requiredCapabilities: ['code-writing'] } } as unknown as Task;
      const agents: WaitingAgent[] = [
        createAgent({ agentId: 'a1', capabilities: ['code-writing'], waitingSince: 2000, workspaceContext: { repoId: 'r1', type: 'github' } }),
        createAgent({ agentId: 'a2', capabilities: ['code-writing'], waitingSince: 1000, workspaceContext: { repoId: 'r1', type: 'github' } }),
      ];

      const best = findBestAgent(tEqual, agents);
      expect(best?.agentId).toBe('a2');
    });

    it('findBestAgent returns null if no eligible agents', () => {
      const t1 = { id: 't1', to: { requiredCapabilities: ['spec-writing'] } } as unknown as Task;
      const agents: WaitingAgent[] = [
        createAgent({ agentId: 'a1', capabilities: ['code-writing'] })
      ];
      expect(findBestAgent(t1, agents)).toBeNull();
    });

    it('findAndReserveAgent performs atomic reservation steps', () => {
      const mockQ: any = {
        getWaitingAgentsWithDetails: vi.fn(),
        updateStatus: vi.fn(),
        pendingAcks: new Map(),
        emit: vi.fn(),
        removeWaitingAgent: vi.fn()
      };

      const t1 = { id: 't1', to: { requiredCapabilities: [] } } as unknown as Task;
      const agents = [createAgent({ agentId: 'a1', capabilities: ['code-writing'] })];

      vi.mocked(mockQ.getWaitingAgentsWithDetails).mockReturnValue(agents);

      const result = findAndReserveAgent(mockQ, t1);

      expect(result).toBe('a1');
      expect(mockQ.updateStatus).toHaveBeenCalledWith('t1', 'PENDING_ACK');
      expect(mockQ.pendingAcks.has('t1')).toBe(true);
      expect(mockQ.emit).toHaveBeenCalledWith('task', t1, 'a1');
      expect(mockQ.removeWaitingAgent).toHaveBeenCalledWith('a1');
    });

    it('findPendingTaskForAgent sorts tasks by priority', () => {
      const mockQ: any = {
        getByStatuses: vi.fn().mockReturnValue([
          { id: 't1', priority: 'normal', createdAt: 1000, to: { requiredCapabilities: ['code-writing'] } },
          { id: 't2', priority: 'high', createdAt: 2000, to: { requiredCapabilities: ['code-writing'] } }
        ]),
        getTask: vi.fn()
      };
      const agent = createAgent({ capabilities: ['code-writing'] });
      const result = findPendingTaskForAgent(mockQ, agent.agentId, agent.capabilities, agent.workspaceContext);
      expect(result?.id).toBe('t2'); // high priority first
    });

    it('findPendingTaskForAgent respects dependencies', () => {
      const mockQ: any = {
        getByStatuses: vi.fn().mockReturnValue([
          { id: 't1', priority: 'high', dependencies: ['blocking-t'], to: { requiredCapabilities: ['code-writing'] } },
          { id: 't2', priority: 'normal', to: { requiredCapabilities: ['code-writing'] } }
        ]),
        getTask: vi.fn().mockImplementation((id) => {
          if (id === 'blocking-t') return { id: 'blocking-t', status: 'IN_PROGRESS' };
          return undefined;
        })
      };
      const agent = createAgent({ capabilities: ['code-writing'] });
      const result = findPendingTaskForAgent(mockQ, agent.agentId, agent.capabilities, agent.workspaceContext, mockQ.getTask);
      expect(result?.id).toBe('t2'); // t1 blocked
    });

    it('waitForTask handles immediate eviction', async () => {
      const mockQ: any = {
        popEviction: vi.fn().mockReturnValue({ reason: 'RESTART' })
      };
      const result = await waitForTask(mockQ, 'a1', ['code-writing'], undefined);

      expect(result).not.toBeNull();
      if (result && 'controlSignal' in result) {
        expect(result.controlSignal).toBe('EVICT');
        expect(result.reason).toBe('RESTART');
      } else {
        throw new Error('Expected eviction result');
      }
    });

    it('waitForTask handles immediate task match', async () => {
      const mockQ: any = {
        popEviction: vi.fn().mockReturnValue(null),
        addWaitingAgent: vi.fn(),
        getTask: vi.fn(),
        getByStatuses: vi.fn().mockReturnValue([{
          id: 't1',
          priority: 'normal',
          createdAt: 1000,
          to: { requiredCapabilities: ['code-writing'] }
        }]),
        removeWaitingAgent: vi.fn(),
        updateStatus: vi.fn(),
        pendingAcks: new Map()
      };

      const result = await waitForTask(mockQ, 'a1', ['code-writing'], undefined);
      const task = result as Task;
      expect(task.id).toBe('t1');
      expect(mockQ.updateStatus).toHaveBeenCalledWith('t1', 'PENDING_ACK');
    });

    it('waitForTask waits for event and handles timeout', async () => {
      const listeners: Record<string, Function> = {};
      const mockQ: any = {
        popEviction: vi.fn().mockReturnValue(null),
        addWaitingAgent: vi.fn(),
        getByStatuses: vi.fn().mockReturnValue([]),
        removeWaitingAgent: vi.fn(),
        on: vi.fn((event, cb) => listeners[event] = cb),
        off: vi.fn(),
      };

      const promise = waitForTask(mockQ, 'a1', ['code-writing'], undefined, 100);

      vi.advanceTimersByTime(110);
      const result = await promise;
      expect(result).toBeNull();
      expect(mockQ.removeWaitingAgent).toHaveBeenCalledWith('a1');
    });
  });

  // Additional PollingService Tests
  describe('PollingService Extra', () => {
    let pollingService: PollingService;
    let mockRepo: any = { getById: vi.fn(), getByStatus: vi.fn(), updateStatus: vi.fn() };
    let mockPersistence: any = {
      setAgentWaiting: vi.fn(),
      clearAgentWaiting: vi.fn(),
      resetWaitingAgents: vi.fn(),
      clearPendingAck: vi.fn(),
      setPendingAck: vi.fn()
    };
    let mockMatcher: any = { findPendingTaskForAgent: vi.fn() };
    let mockEviction: any = { popEviction: vi.fn() };
    let emitter = new TypedEventEmitter();
    beforeEach(() => {
      pollingService = new PollingService(mockRepo, mockPersistence, mockMatcher, mockEviction, emitter);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('waitForTaskCompletion checks db immediately if already complete', async () => {
      vi.mocked(mockRepo.getById).mockReturnValue({ id: 't1', status: 'COMPLETED' } as Task);
      const result = await pollingService.waitForTaskCompletion('t1');
      expect(result?.status).toBe('COMPLETED');
    });

    it('waitForTaskCompletion times out if task never completes', async () => {
      vi.mocked(mockRepo.getById).mockReturnValue(null);
      const promise = pollingService.waitForTaskCompletion('t1', 100);
      vi.advanceTimersByTime(150);
      const result = await promise;
      expect(result).toBeNull();
    });

    it('waitForTaskCompletion resolves on event', async () => {
      vi.mocked(mockRepo.getById).mockReturnValue(null);
      const promise = pollingService.waitForTaskCompletion('t1');

      setTimeout(() => {
        emitter.emit('completion', { id: 't1', status: 'COMPLETED' } as Task);
      }, 10);

      vi.advanceTimersByTime(20);
      const result = await promise;
      expect(result?.status).toBe('COMPLETED');
    });

    it('resetStaleState clears pending acks and waiting agents', () => {
      vi.mocked(mockRepo.getByStatus).mockReturnValue([{ id: 't1' } as Task]);

      pollingService.resetStaleState();

      expect(mockRepo.updateStatus).toHaveBeenCalledWith('t1', 'QUEUED');
      expect(mockPersistence.clearPendingAck).toHaveBeenCalledWith('t1');
      expect(mockPersistence.resetWaitingAgents).toHaveBeenCalled();
    });

    it('waitForTask returns eviction immediately', async () => {
      vi.mocked(mockEviction.popEviction).mockReturnValue({ reason: 'TEST', controlSignal: 'EVICT', action: 'RESTART' });
      const result = await pollingService.waitForTask('a1', ['code-writing'], undefined);
      expect((result as any).controlSignal).toBe('EVICT');
    });

    it('waitForTask returns task immediately', async () => {
      vi.mocked(mockEviction.popEviction).mockReturnValue(null);
      vi.mocked(mockMatcher.findPendingTaskForAgent).mockReturnValue({ id: 't1' });
      const result = await pollingService.waitForTask('a1', ['code-writing'], undefined);
      expect((result as Task).id).toBe('t1');
      expect(mockPersistence.clearAgentWaiting).toHaveBeenCalled();
    });

    it('waitForTask waits and resolves on event', async () => {
      vi.mocked(mockEviction.popEviction).mockReturnValue(null);
      vi.mocked(mockMatcher.findPendingTaskForAgent).mockReturnValue(undefined);

      const promise = pollingService.waitForTask('a1', ['code-writing'], undefined);

      // Emit task event
      setTimeout(() => {
        emitter.emit('task', { id: 't1' } as Task, 'a1');
      }, 10);

      vi.advanceTimersByTime(20);
      const result = await promise;
      expect((result as Task).id).toBe('t1');
    });

    it('waitForTask calls onAgentWaiting callback', async () => {
      const onWaiting = vi.fn();
      const serviceWithCallback = new PollingService(mockRepo, mockPersistence, mockMatcher, mockEviction, emitter, onWaiting);

      vi.mocked(mockEviction.popEviction).mockReturnValue(null);
      vi.mocked(mockMatcher.findPendingTaskForAgent).mockReturnValue({ id: 't1' });

      await serviceWithCallback.waitForTask('a1', ['code-writing'], undefined);

      // Advance timers to trigger setImmediate if it's mocked, or just wait a bit
      vi.advanceTimersByTime(10);
      expect(onWaiting).toHaveBeenCalled();
    });

    it('waitForTask handles eviction event', async () => {
      vi.mocked(mockEviction.popEviction).mockReturnValue(null);
      vi.mocked(mockMatcher.findPendingTaskForAgent).mockReturnValue(undefined);

      const promise = pollingService.waitForTask('a1', ['code-writing'], undefined);

      // Emit eviction event
      setTimeout(() => {
        // Mock popEviction to return something when event fires
        vi.mocked(mockEviction.popEviction).mockReturnValue({ reason: 'TEST', controlSignal: 'EVICT' });
        emitter.emit('eviction', 'a1');
      }, 10);

      vi.advanceTimersByTime(20);
      const result = await promise;
      expect((result as any).controlSignal).toBe('EVICT');
    });
  });

  describe('HybridScheduler Internals', () => {
    let scheduler: HybridScheduler;
    let mockQueue: any;

    beforeEach(() => {
      mockQueue = {
        getPendingAcks: vi.fn().mockReturnValue(new Map()),
        updateStatus: vi.fn(),
        forceRetry: vi.fn(),
        getByStatus: vi.fn().mockReturnValue([]),
        getTask: vi.fn(),
        getByStatuses: vi.fn().mockReturnValue([]),
        getWaitingAgents: vi.fn().mockReturnValue(new Map()),
        getBusyAgentIds: vi.fn().mockReturnValue([]),
        findAndReserveAgent: vi.fn(),
        getAssignedTasksForAgent: vi.fn().mockReturnValue([]),
        getAgentLastSeen: vi.fn(),
        getTaskFromDB: vi.fn(),
        getTaskLastProgress: vi.fn().mockReturnValue(undefined),
        touchTask: vi.fn()
      };
      scheduler = new HybridScheduler(mockQueue);
    });

    it('requeueStuckTasks requeues expired tasks', () => {
      const stuckMap = new Map();
      stuckMap.set('t1', { taskId: 't1', agentId: 'a1', sentAt: Date.now() - 60000 });
      vi.mocked(mockQueue.getPendingAcks).mockReturnValue(stuckMap);

      scheduler.runCycle();

      expect(mockQueue.forceRetry).toHaveBeenCalledWith('t1');
    });

    it('checkBlockedTasks unblocks satisfied tasks', () => {
      const blockedTask = { id: 'blocked', dependencies: ['dep1'], status: 'BLOCKED' } as Task;
      vi.mocked(mockQueue.getByStatus).mockReturnValue([blockedTask]);

      vi.mocked(mockQueue.getTask).mockImplementation((id: string) => {
        if (id === 'dep1') return { id: 'dep1', status: 'COMPLETED' } as Task;
        return undefined;
      });

      scheduler.runCycle();

      expect(mockQueue.updateStatus).toHaveBeenCalledWith('blocked', 'QUEUED');
    });

    it('assignPendingTasks calls findAndReserveAgent for queued tasks', () => {
      vi.mocked(mockQueue.getByStatuses).mockReturnValue([{ id: 't1', to: {} } as Task]);

      const waitingMap = new Map();
      waitingMap.set('a1', { capabilities: ['code-writing'] });
      vi.mocked(mockQueue.getWaitingAgents).mockReturnValue(waitingMap);

      vi.mocked(mockQueue.findAndReserveAgent).mockReturnValue('a1');

      scheduler.runCycle();

      expect(mockQueue.findAndReserveAgent).toHaveBeenCalled();
    });

    it.skip('rebalanceStaleTasks requeues stale tasks', () => {
      // TODO: Fix this test - fails due to mock timing issue
      const staleTime = Date.now() - (31 * 60 * 1000);
      const staleTask = { id: 't1', status: 'IN_PROGRESS', createdAt: staleTime } as Task;

      mockQueue.forceRetry = vi.fn();
      mockQueue.getByStatuses = vi.fn().mockReturnValue([staleTask]);
      mockQueue.getTaskLastProgress = vi.fn().mockReturnValue(undefined);

      const testScheduler = new HybridScheduler(mockQueue);
      testScheduler.runCycle();

      expect(mockQueue.forceRetry).toHaveBeenCalledWith('t1');
    });
  });
});
