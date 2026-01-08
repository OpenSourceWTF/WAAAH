import { describe, it, expect } from 'vitest';
import {
  AgentRole,
  TaskStatus,
  registerAgentSchema,
  waitForPromptSchema,
  sendResponseSchema,
  assignTaskSchema,
  listAgentsSchema,
  getAgentStatusSchema,
  ackTaskSchema,
  adminUpdateAgentSchema,
  TOOL_NAMES
} from '../src/index.js';

describe('AgentRole', () => {
  it('accepts valid roles', () => {
    expect(AgentRole.parse('project-manager')).toBe('project-manager');
    expect(AgentRole.parse('full-stack-engineer')).toBe('full-stack-engineer');
    expect(AgentRole.parse('developer')).toBe('developer');
  });

  it('rejects invalid roles', () => {
    expect(() => AgentRole.parse('invalid-role')).toThrow();
    expect(() => AgentRole.parse('')).toThrow();
    expect(() => AgentRole.parse(123)).toThrow();
  });
});

describe('TaskStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['QUEUED', 'PENDING_ACK', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'];
    statuses.forEach(s => expect(TaskStatus.parse(s)).toBe(s));
  });

  it('rejects invalid statuses', () => {
    expect(() => TaskStatus.parse('INVALID')).toThrow();
    expect(() => TaskStatus.parse('queued')).toThrow();
  });
});

// TaskPriority is inline in assignTaskSchema, not a standalone export
// Removed standalone TaskPrioritySchema tests

describe('registerAgentSchema', () => {
  it('validates complete input', () => {
    const result = registerAgentSchema.parse({
      agentId: 'test-agent',
      role: 'developer',
      displayName: '@Test',
      capabilities: ['coding', 'testing']
    });
    expect(result.agentId).toBe('test-agent');
  });

  it('applies defaults for optional fields', () => {
    const result = registerAgentSchema.parse({
      agentId: 'test-agent',
      role: 'developer',
      displayName: '@Test'
    });
    // capabilities is optional, not defaulted to []
    expect(result.capabilities).toBeUndefined();
  });

  it('rejects empty agentId', () => {
    expect(() => registerAgentSchema.parse({
      agentId: '',
      role: 'developer',
      displayName: '@Test'
    })).toThrow();
  });
});

describe('waitForPromptSchema', () => {
  it('validates with default timeout', () => {
    const result = waitForPromptSchema.parse({ agentId: 'test' });
    expect(result.timeout).toBe(290);
  });

  it('accepts custom timeout within limits', () => {
    expect(waitForPromptSchema.parse({ agentId: 'test', timeout: 60 }).timeout).toBe(60);
  });

  it('coerces timeout > 300 to default max (290)', () => {
    expect(waitForPromptSchema.parse({ agentId: 'test', timeout: 301 }).timeout).toBe(290);
    expect(waitForPromptSchema.parse({ agentId: 'test', timeout: 3600 }).timeout).toBe(290);
  });

  it('coerces timeout < 1 to min (1)', () => {
    expect(waitForPromptSchema.parse({ agentId: 'test', timeout: 0 }).timeout).toBe(1);
    expect(waitForPromptSchema.parse({ agentId: 'test', timeout: -5 }).timeout).toBe(1);
  });
});

describe('sendResponseSchema', () => {
  it('validates complete response', () => {
    const result = sendResponseSchema.parse({
      taskId: 'task-123',
      status: 'COMPLETED',
      message: 'Done'
    });
    expect(result.taskId).toBe('task-123');
  });

  it('accepts optional artifacts', () => {
    const result = sendResponseSchema.parse({
      taskId: 'task-123',
      status: 'COMPLETED',
      message: 'Done',
      artifacts: ['file1.ts', 'file2.ts']
    });
    expect(result.artifacts).toHaveLength(2);
  });
});

describe('assignTaskSchema', () => {
  it('validates delegation request with defaults', () => {
    const result = assignTaskSchema.parse({
      targetAgentId: 'fullstack-1',
      sourceAgentId: 'boss-1',
      prompt: 'Build a feature'
    });
    expect(result.priority).toBe('normal');
  });

  it('rejects empty prompt', () => {
    expect(() => assignTaskSchema.parse({
      targetAgentId: 'fullstack-1',
      sourceAgentId: 'boss-1',
      prompt: ''
    })).toThrow();
  });
});

describe('listAgentsSchema', () => {
  it('accepts empty object', () => {
    expect(listAgentsSchema.parse({})).toBeDefined();
  });

  it('accepts role filter', () => {
    const result = listAgentsSchema.parse({ role: 'developer' });
    expect(result.role).toBe('developer');
  });
});

describe('getAgentStatusSchema', () => {
  it('requires agentId', () => {
    expect(getAgentStatusSchema.parse({ agentId: 'test' })).toBeDefined();
    expect(() => getAgentStatusSchema.parse({})).toThrow();
  });
});

describe('ackTaskSchema', () => {
  it('requires both taskId and agentId', () => {
    expect(ackTaskSchema.parse({ taskId: 't1', agentId: 'a1' })).toBeDefined();
    expect(() => ackTaskSchema.parse({ taskId: 't1' })).toThrow();
    expect(() => ackTaskSchema.parse({ agentId: 'a1' })).toThrow();
  });
});

describe('adminUpdateAgentSchema', () => {
  it('validates valid status', () => {
    expect(adminUpdateAgentSchema.parse({ agentId: 'test', status: 'active' })).toBeDefined();
  });

  it('accepts metadata', () => {
    expect(adminUpdateAgentSchema.parse({ agentId: 'test', metadata: { foo: 'bar' } })).toBeDefined();
  });
});

describe('TOOL_NAMES', () => {
  it('exports all tool names', () => {
    expect(TOOL_NAMES).toContain('register_agent');
    expect(TOOL_NAMES).toContain('wait_for_prompt');
    expect(TOOL_NAMES).toContain('assign_task');
    expect(TOOL_NAMES.length).toBeGreaterThanOrEqual(8);
  });
});
