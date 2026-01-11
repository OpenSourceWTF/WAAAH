
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskHandlers } from '../src/mcp/handlers/task-handlers';
import { TaskQueue } from '../src/state/queue';
import { AgentRepository } from '../src/state/agent-repository';

// Mock dependencies
const mockEnqueue = vi.fn();
const mockEmit = vi.fn();

const mockQueue = {
  enqueue: mockEnqueue,
  emit: mockEmit,
  addMessage: vi.fn(),
  getUnreadComments: vi.fn().mockReturnValue([]),
  markCommentsAsRead: vi.fn()
} as unknown as TaskQueue;

const mockRepo = {
  get: vi.fn().mockReturnValue({ displayName: 'Test Agent' }),
  heartbeat: vi.fn(),
  getByDisplayName: vi.fn().mockReturnValue({ id: 'target-agent', displayName: 'Target Agent' })
} as unknown as AgentRepository;

describe('TaskHandlers - Dependency Fix', () => {
  let handlers: TaskHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new TaskHandlers(mockRepo, mockQueue);
  });

  // Check constructor arg order!
  // TaskHandlers(registry: AgentRepository, queue: TaskQueue)
  // I passed (mockRepo, mockQueue) above which seems correct if order is registry, queue.
  // Let's verify TaskHandlers constructor: 
  // constructor(private registry: AgentRepository, private queue: TaskQueue) { } 
  // Yes.

  it('should lift context.dependencies to top-level dependencies in assign_task', async () => {
    await handlers.assign_task({
      targetAgentId: 'target-agent',
      prompt: 'Do something',
      context: {
        dependencies: ['dep-1', 'dep-2'],
        someOtherContext: 'value'
      },
      sourceAgentId: 'source-agent'
    });

    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      dependencies: ['dep-1', 'dep-2'] // Verify it was lifted
    }));

    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        someOtherContext: 'value'
      })
    }));
  });

  it('should prefer top-level dependencies if provided', async () => {
    await handlers.assign_task({
      targetAgentId: 'target-agent',
      prompt: 'Do something',
      dependencies: ['top-level-dep'],
      context: {
        dependencies: ['context-dep'] // Should be ignored if top-level exists
      },
      sourceAgentId: 'source-agent'
    });

    expect(mockEnqueue).toHaveBeenCalledWith(expect.objectContaining({
      dependencies: ['top-level-dep']
    }));
  });
});
