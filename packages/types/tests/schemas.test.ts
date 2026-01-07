import { describe, it, expect } from 'vitest';
import {
  AgentRoleSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
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

describe('AgentRoleSchema', () => {
  it('accepts valid roles', () => {
    expect(AgentRoleSchema.parse('project-manager')).toBe('project-manager');
    expect(AgentRoleSchema.parse('full-stack-engineer')).toBe('full-stack-engineer');
    expect(AgentRoleSchema.parse('developer')).toBe('developer');
  });

  it('rejects invalid roles', () => {
    expect(() => AgentRoleSchema.parse('invalid-role')).toThrow();
    expect(() => AgentRoleSchema.parse('')).toThrow();
    expect(() => AgentRoleSchema.parse(123)).toThrow();
  });
});

describe('TaskStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const statuses = ['QUEUED', 'PENDING_ACK', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED', 'TIMEOUT'];
    statuses.forEach(s => expect(TaskStatusSchema.parse(s)).toBe(s));
  });

  it('rejects invalid statuses', () => {
    expect(() => TaskStatusSchema.parse('INVALID')).toThrow();
    expect(() => TaskStatusSchema.parse('queued')).toThrow();
  });
});

describe('TaskPrioritySchema', () => {
  it('accepts valid priorities', () => {
    expect(TaskPrioritySchema.parse('normal')).toBe('normal');
    expect(TaskPrioritySchema.parse('high')).toBe('high');
    expect(TaskPrioritySchema.parse('critical')).toBe('critical');
  });
});

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
    expect(result.capabilities).toEqual([]);
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

  it('rejects timeout > 300', () => {
    expect(() => waitForPromptSchema.parse({ agentId: 'test', timeout: 301 })).toThrow();
  });

  it('rejects timeout < 1', () => {
    expect(() => waitForPromptSchema.parse({ agentId: 'test', timeout: 0 })).toThrow();
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
      prompt: 'Build a feature'
    });
    expect(result.priority).toBe('normal');
  });

  it('rejects empty prompt', () => {
    expect(() => assignTaskSchema.parse({
      targetAgentId: 'fullstack-1',
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
  it('validates hex color format', () => {
    expect(adminUpdateAgentSchema.parse({ agentId: 'test', color: '#FF5733' })).toBeDefined();
  });

  it('rejects invalid color format', () => {
    expect(() => adminUpdateAgentSchema.parse({ agentId: 'test', color: 'red' })).toThrow();
    expect(() => adminUpdateAgentSchema.parse({ agentId: 'test', color: '#FFF' })).toThrow();
  });
});

describe('TOOL_NAMES', () => {
  it('exports all tool names', () => {
    expect(TOOL_NAMES).toContain('register_agent');
    expect(TOOL_NAMES).toContain('wait_for_prompt');
    expect(TOOL_NAMES).toContain('assign_task');
    expect(TOOL_NAMES).toHaveLength(8);
  });
});
