
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext, TestContext } from './harness.js';
import { Task, WorkspaceContext } from '@opensourcewtf/waaah-types';

describe('Workspace Affinity Reproduction', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx.close();
  });

  it('reproduces "OpenSourceWTF/dojo" vs "OpenSourceWTF/dojo-skills" mismatch', async () => {
    // 1. Setup specific workspace names that are substrings of each other
    const wsDojo: WorkspaceContext = { type: 'github', repoId: 'OpenSourceWTF/dojo' };
    const wsDojoSkills: WorkspaceContext = { type: 'github', repoId: 'OpenSourceWTF/dojo-skills' };

    const agentDojoSkills = 'agent-dojo-skills';

    // 2. Register agent in "dojo-skills"
    ctx.registry.register({
      id: agentDojoSkills,
      displayName: 'Agent Dojo Skills',
      capabilities: ['code-writing', 'spec-writing'],
      workspaceContext: wsDojoSkills
    });

    // 3. Create task intending for "dojo"
    const taskId = 'task-targeting-dojo';
    ctx.queue.enqueue({
      id: taskId,
      command: 'execute_prompt',
      prompt: 'Task for Dojo Core',
      from: { type: 'user', id: 'user', name: 'User' },
      to: {
        workspaceId: 'OpenSourceWTF/dojo',
        requiredCapabilities: ['code-writing']
      },
      priority: 'normal',
      status: 'QUEUED',
      createdAt: Date.now()
    });

    // 4. Agent from "dojo-skills" tries to pick up a task
    console.log('--- STARTING WAIT ---');
    const result = await ctx.queue.waitForTask(
      agentDojoSkills,
      ['code-writing', 'spec-writing'],
      wsDojoSkills,
      200 // Short timeout
    );
    console.log('--- END WAIT ---');

    // 5. Expectation: IT SHOULD BE NULL.
    // usage of 'expect(result).toBeNull()' asserts that affinity works.
    // If this fails (result is NOT null), we reproduced the bug.
    expect(result).toBeNull();
  });
});
