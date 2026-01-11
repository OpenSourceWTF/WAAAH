
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskHandlers } from '../src/mcp/handlers/task-handlers.js';
import { AgentRepository } from '../src/state/agent-repository.js';
import { TaskQueue } from '../src/state/queue.js';
import { z } from 'zod';

// Mock dependencies
const mockRegistry = {
  heartbeat: vi.fn(),
  get: vi.fn(),
  getByDisplayName: vi.fn()
} as unknown as AgentRepository;

const mockQueue = {
  enqueue: vi.fn(),
  getTask: vi.fn(),
  updateStatus: vi.fn(),
  ackTask: vi.fn(),
  addMessage: vi.fn(),
  getMessages: vi.fn(),
  getUnreadComments: vi.fn()
} as unknown as TaskQueue;

describe('TaskHandlers: Orc Reliability', () => {
  let handlers: TaskHandlers;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = new TaskHandlers(mockRegistry, mockQueue);
  });

  it('assign_task should inject MANDATORY SETUP block into prompt', async () => {
    // Arrange
    const args = {
      prompt: 'Fix the bug',
      taskId: 'test-123'
    };

    // Act
    await handlers.assign_task(args);

    // Assert
    expect(mockQueue.enqueue).toHaveBeenCalledTimes(1);
    const queuedTask = (mockQueue.enqueue as any).mock.calls[0][0];

    expect(queuedTask.prompt).toContain('Fix the bug');
    expect(queuedTask.prompt).toContain('## SETUP (MANDATORY)');
    expect(queuedTask.prompt).toContain('git worktree add .worktrees/feature-task-');
    expect(queuedTask.prompt).toContain('-b feature-task-');
  });

  it('send_response should persist diff in task response', async () => {
    // Arrange
    const args = {
      taskId: 'task-123',
      status: 'IN_REVIEW',
      message: 'Done',
      diff: 'diff --git a/file.ts b/file.ts\n+ changed'
    };

    // Act
    await handlers.send_response(args);

    // Assert
    expect(mockQueue.updateStatus).toHaveBeenCalledWith(
      'task-123',
      'IN_REVIEW',
      expect.objectContaining({
        message: 'Done',
        diff: 'diff --git a/file.ts b/file.ts\n+ changed'
      })
    );
  });
});
