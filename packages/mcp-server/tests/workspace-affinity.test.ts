
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentMatchingService } from '../src/state/services/agent-matching-service.js';
import { PollingService } from '../src/state/services/polling-service.js';
import { QueuePersistence } from '../src/state/persistence/queue-persistence.js';
import { createTestContext, TestContext } from './harness.js';
import { Task, WorkspaceContext } from '@opensourcewtf/waaah-types';

describe('Workspace Affinity', () => {
  let ctx: TestContext;
  let matchingService: AgentMatchingService;
  let pollingService: PollingService;

  beforeEach(() => {
    ctx = createTestContext();
    // We need to access services directly for fine-grained testing
    // harness returns queue, we can access its services if they were public or we can re-instantiate them with the same DB
    // But TestContext exposes queue. The queue uses private services.
    // However, we can use queue.waitForTask directly.
  });

  afterEach(() => {
    ctx.close();
  });

  it('assigns task to agent in same workspace', async () => {
    const workspaceX: WorkspaceContext = { type: 'github', repoId: 'RepoX' };
    const agentId = 'agent-x';

    // 1. Register agent in Repo X
    ctx.registry.register({
      id: agentId,
      displayName: 'Agent X',
      capabilities: ['code-writing'],
      workspaceContext: workspaceX
    });

    // 2. Create task for Repo X
    const taskId = 'task-x';
    ctx.queue.enqueue({
      id: taskId,
      command: 'execute_prompt',
      prompt: 'Do work in Repo X',
      from: { type: 'user', id: 'user', name: 'User' },
      to: { workspaceId: 'RepoX' }, // Affinity to Repo X
      priority: 'normal',
      status: 'QUEUED',
      createdAt: Date.now()
    });

    // 3. Agent waits for task
    const result = await ctx.queue.waitForTask(agentId, ['code-writing'], workspaceX, 100);

    // 4. Verify assignment
    expect(result).not.toBeNull();
    const task = result as Task;
    expect(task.id).toBe(taskId);
  });

  it('does NOT assign task to agent in different workspace', async () => {
    const workspaceY: WorkspaceContext = { type: 'github', repoId: 'RepoY' };
    const agentId = 'agent-y';

    // 1. Register agent in Repo Y
    ctx.registry.register({
      id: agentId,
      displayName: 'Agent Y',
      capabilities: ['code-writing'],
      workspaceContext: workspaceY
    });

    // 2. Create task for Repo X
    const taskId = 'task-x-2';
    ctx.queue.enqueue({
      id: taskId,
      command: 'execute_prompt',
      prompt: 'Do work in Repo X',
      from: { type: 'user', id: 'user', name: 'User' },
      to: { workspaceId: 'RepoX' }, // Affinity to Repo X
      priority: 'normal',
      status: 'QUEUED',
      createdAt: Date.now()
    });

    // 3. Agent Y waits for task
    const result = await ctx.queue.waitForTask(agentId, ['code-writing'], workspaceY, 100);

    // 4. Verify NO assignment
    expect(result).toBeNull(); // Should timeout/return null
  });

  it('assigns task to correct agent when multiple are waiting in different workspaces', async () => {
    const wsX: WorkspaceContext = { type: 'github', repoId: 'RepoX' };
    const wsY: WorkspaceContext = { type: 'github', repoId: 'RepoY' };

    ctx.registry.register({ id: 'agent-x', displayName: 'X', capabilities: ['code-writing'], workspaceContext: wsX });
    ctx.registry.register({ id: 'agent-y', displayName: 'Y', capabilities: ['code-writing'], workspaceContext: wsY });

    // Enqueue task for X
    const taskIdX = 'task-for-x';
    ctx.queue.enqueue({
      id: taskIdX,
      command: 'exec',
      prompt: 'For X',
      from: { type: 'user', id: 'u', name: 'u' },
      to: { workspaceId: 'RepoX' },
      priority: 'normal',
      status: 'QUEUED',
      createdAt: Date.now()
    });

    // Both wait
    const pX = ctx.queue.waitForTask('agent-x', ['code-writing'], wsX, 200);
    const pY = ctx.queue.waitForTask('agent-y', ['code-writing'], wsY, 200);

    const [resX, resY] = await Promise.all([pX, pY]);

    const taskX = resX as Task;
    expect(taskX?.id).toBe(taskIdX);
    expect(resY).toBeNull();
  });

  it('does NOT assign workspace-bound task to unbound agent', async () => {
    // Unbound agent (no workspace context)
    const agentId = 'agent-unbound';
    ctx.registry.register({ id: agentId, displayName: 'Unbound', capabilities: ['code-writing'] });

    // Task for Repo X
    const taskId = 'task-x-strict';
    ctx.queue.enqueue({
      id: taskId,
      command: 'exec',
      prompt: 'Repo X work',
      from: { type: 'user', id: 'u', name: 'u' },
      to: { workspaceId: 'RepoX' },
      priority: 'normal',
      status: 'QUEUED',
      createdAt: Date.now()
    });

    // Unbound agent waits
    const result = await ctx.queue.waitForTask(agentId, ['code-writing'], undefined, 100);

    // Should NOT be assigned
    expect(result).toBeNull();
  });
});
