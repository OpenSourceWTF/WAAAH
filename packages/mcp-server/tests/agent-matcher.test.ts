/**
 * Agent Matcher Tests
 * 
 * Tests for capability-based agent scoring and matching.
 * Tests only exported public functions.
 */

import { describe, it, expect } from 'vitest';
import {
  scoreAgent,
  findBestAgent,
  isTaskForAgent,
  SCHEDULER_CONFIG
} from '../src/state/agent-matcher.js';
import type { Task } from '@opensourcewtf/waaah-types';
import type { WaitingAgent } from '../src/state/agent-matcher.js';

// Helper to create minimal task
function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    command: 'execute_prompt',
    prompt: 'Test prompt',
    from: { type: 'user', id: 'u1', name: 'User' },
    to: {},
    priority: 'normal',
    status: 'QUEUED',
    createdAt: Date.now(),
    ...overrides
  } as Task;
}

// Helper to create waiting agent
function createAgent(agentId: string, capabilities: string[] = [], workspaceContext?: any): WaitingAgent {
  return {
    agentId,
    capabilities: capabilities as any[],
    workspaceContext,
    waitingSince: Date.now()
  };
}

describe('SCHEDULER_CONFIG', () => {
  it('has scoring weights defined', () => {
    expect(SCHEDULER_CONFIG.weights).toBeDefined();
    expect(SCHEDULER_CONFIG.weights.workspace).toBeGreaterThan(0);
    expect(SCHEDULER_CONFIG.weights.capabilities).toBeGreaterThan(0);
    expect(SCHEDULER_CONFIG.weights.agentHint).toBeGreaterThan(0);
  });
});

describe('scoreAgent', () => {
  it('calculates weighted score for eligible agent', () => {
    const task = createTask({
      to: { requiredCapabilities: ['code-writing'] }
    });
    const agent = createAgent('a1', ['code-writing']);

    const result = scoreAgent(task, agent);

    expect(result.agentId).toBe('a1');
    expect(result.score).toBeGreaterThan(0);
    expect(result.eligible).toBe(true);
    expect(result.workspaceScore).toBeDefined();
    expect(result.capabilityScore).toBeDefined();
    expect(result.hintScore).toBeDefined();
  });

  it('marks ineligible agent with score 0', () => {
    const task = createTask({
      to: { requiredCapabilities: ['spec-writing'] }
    });
    const agent = createAgent('a1', ['code-writing']);

    const result = scoreAgent(task, agent);

    expect(result.eligible).toBe(false);
    expect(result.score).toBe(0);
  });

  it('gives higher score to preferred agent', () => {
    const task = createTask({
      to: { agentId: 'preferred', requiredCapabilities: ['code-writing'] }
    });
    const preferred = createAgent('preferred', ['code-writing']);
    const other = createAgent('other', ['code-writing']);

    const preferredScore = scoreAgent(task, preferred);
    const otherScore = scoreAgent(task, other);

    expect(preferredScore.score).toBeGreaterThan(otherScore.score);
    expect(preferredScore.hintScore).toBeGreaterThan(otherScore.hintScore);
  });

  it('gives higher workspace score for exact match', () => {
    const task = createTask({
      to: { requiredCapabilities: ['code-writing'] },
      context: { workspace: { type: 'github', repoId: 'org/repo' } }
    });
    const matchingAgent = createAgent('match', ['code-writing'], { type: 'github', repoId: 'org/repo' });
    const mismatchAgent = createAgent('mismatch', ['code-writing'], { type: 'github', repoId: 'other/repo' });

    const matchScore = scoreAgent(task, matchingAgent);
    const mismatchScore = scoreAgent(task, mismatchAgent);

    expect(matchScore.workspaceScore).toBeGreaterThan(mismatchScore.workspaceScore);
  });
});

describe('findBestAgent', () => {
  it('returns highest scoring eligible agent', () => {
    const task = createTask({
      to: { requiredCapabilities: ['code-writing'], agentId: 'preferred' }
    });
    const agents = [
      createAgent('a1', ['code-writing']),
      createAgent('preferred', ['code-writing']),
      createAgent('a2', ['code-writing'])
    ];
    // Make sure waitingSince differs
    agents[0].waitingSince = Date.now() - 1000;
    agents[1].waitingSince = Date.now() - 500;
    agents[2].waitingSince = Date.now() - 2000;

    const best = findBestAgent(task, agents);

    // Preferred agent should win due to hint score
    expect(best?.agentId).toBe('preferred');
  });

  it('returns null when no eligible agents', () => {
    const task = createTask({
      to: { requiredCapabilities: ['spec-writing'] }
    });
    const agents = [
      createAgent('a1', ['code-writing']),
      createAgent('a2', ['test-writing'])
    ];

    expect(findBestAgent(task, agents)).toBeNull();
  });

  it('returns null for empty agent list', () => {
    const task = createTask();
    expect(findBestAgent(task, [])).toBeNull();
  });

  it('uses waitingSince as tiebreaker (oldest first)', () => {
    const task = createTask({
      to: { requiredCapabilities: ['code-writing'] }
    });
    const agents = [
      createAgent('newer', ['code-writing']),
      createAgent('older', ['code-writing'])
    ];
    agents[0].waitingSince = Date.now();
    agents[1].waitingSince = Date.now() - 10000; // 10 seconds earlier

    const best = findBestAgent(task, agents);
    expect(best?.agentId).toBe('older');
  });

  it('selects agent with all required capabilities', () => {
    const task = createTask({
      to: { requiredCapabilities: ['code-writing', 'test-writing'] }
    });
    const agents = [
      createAgent('partial', ['code-writing']),
      createAgent('full', ['code-writing', 'test-writing', 'doc-writing'])
    ];

    const best = findBestAgent(task, agents);
    expect(best?.agentId).toBe('full');
  });
});

describe('isTaskForAgent (legacy)', () => {
  it('returns true for matching capabilities', () => {
    const task = createTask({
      to: { requiredCapabilities: ['code-writing'] }
    });

    expect(isTaskForAgent(task, 'a1', ['code-writing'])).toBe(true);
  });

  it('returns false for missing capabilities', () => {
    const task = createTask({
      to: { requiredCapabilities: ['spec-writing'] }
    });

    expect(isTaskForAgent(task, 'a1', ['code-writing'])).toBe(false);
  });

  it('returns true for preferred agent even without capabilities requirement', () => {
    const task = createTask({
      to: { agentId: 'preferred' }
    });

    expect(isTaskForAgent(task, 'preferred', [])).toBe(true);
  });

  it('returns true when no capability requirements', () => {
    const task = createTask({ to: {} });

    expect(isTaskForAgent(task, 'any', [])).toBe(true);
  });

  it('returns false for wrong preferred agent', () => {
    const task = createTask({
      to: { agentId: 'other', requiredCapabilities: ['code-writing'] }
    });

    // Has capabilities but is not the preferred agent - should still work
    expect(isTaskForAgent(task, 'me', ['code-writing'])).toBe(true);
  });
});
