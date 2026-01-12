import { describe, it, expect } from 'vitest';
import {
  StandardCapability,
  ALL_CAPABILITIES,
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

describe('StandardCapability', () => {
  it('accepts valid capabilities', () => {
    expect(StandardCapability.parse('spec-writing')).toBe('spec-writing');
    expect(StandardCapability.parse('code-writing')).toBe('code-writing');
    expect(StandardCapability.parse('test-writing')).toBe('test-writing');
    expect(StandardCapability.parse('doc-writing')).toBe('doc-writing');
  });

  it('rejects invalid capabilities', () => {
    expect(() => StandardCapability.parse('invalid-capability')).toThrow();
    expect(() => StandardCapability.parse('')).toThrow();
    expect(() => StandardCapability.parse(123)).toThrow();
  });

  it('exports ALL_CAPABILITIES constant', () => {
    expect(ALL_CAPABILITIES).toContain('spec-writing');
    expect(ALL_CAPABILITIES).toContain('code-writing');
    expect(ALL_CAPABILITIES).toContain('test-writing');
    expect(ALL_CAPABILITIES).toContain('doc-writing');
    expect(ALL_CAPABILITIES.length).toBe(4);
  });
});

describe('TaskStatus', () => {
  it('accepts all valid statuses', () => {
    const statuses = [
      'QUEUED', 'PENDING_ACK', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED',
      'IN_REVIEW', 'REJECTED', 'APPROVED_QUEUED', 'APPROVED_PENDING_ACK',
      'COMPLETED', 'FAILED', 'CANCELLED'
    ];
    statuses.forEach(s => expect(TaskStatus.parse(s)).toBe(s));
  });

  it('rejects invalid statuses', () => {
    expect(() => TaskStatus.parse('INVALID')).toThrow();
    expect(() => TaskStatus.parse('queued')).toThrow();
  });
});

describe('registerAgentSchema', () => {
  it('validates complete input with capabilities', () => {
    const result = registerAgentSchema.parse({
      agentId: 'test-agent',
      displayName: '@Test',
      capabilities: ['code-writing', 'test-writing'],
      workspaceContext: {
        type: 'github',
        repoId: 'OpenSourceWTF/WAAAH'
      }
    });
    expect(result.agentId).toBe('test-agent');
    expect(result.capabilities).toEqual(['code-writing', 'test-writing']);
    expect(result.workspaceContext.repoId).toBe('OpenSourceWTF/WAAAH');
  });

  it('requires at least one capability', () => {
    expect(() => registerAgentSchema.parse({
      agentId: 'test-agent',
      displayName: '@Test',
      capabilities: [],
      workspaceContext: { type: 'local', repoId: 'test' }
    })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => registerAgentSchema.parse({
      agentId: '',
      displayName: '@Test',
      capabilities: ['code-writing'],
      workspaceContext: { type: 'local', repoId: 'test' }
    })).toThrow();
  });

  it('accepts workspaceContext', () => {
    const result = registerAgentSchema.parse({
      agentId: 'test-agent',
      capabilities: ['code-writing'],
      workspaceContext: {
        type: 'local',
        repoId: 'OpenSourceWTF/WAAAH'
      }
    });
    expect(result.workspaceContext?.repoId).toBe('OpenSourceWTF/WAAAH');
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
  it('validates with defaults', () => {
    const result = assignTaskSchema.parse({
      prompt: 'Build a feature',
      workspaceId: 'OpenSourceWTF/WAAAH'
    });
    expect(result.priority).toBe('normal');
    expect(result.workspaceId).toBe('OpenSourceWTF/WAAAH');
  });

  it('accepts requiredCapabilities', () => {
    const result = assignTaskSchema.parse({
      prompt: 'Write tests',
      workspaceId: 'OpenSourceWTF/WAAAH',
      requiredCapabilities: ['test-writing']
    });
    expect(result.requiredCapabilities).toEqual(['test-writing']);
  });

  it('accepts workspaceId for affinity', () => {
    const result = assignTaskSchema.parse({
      prompt: 'Fix bug in WAAAH',
      workspaceId: 'OpenSourceWTF/WAAAH'
    });
    expect(result.workspaceId).toBe('OpenSourceWTF/WAAAH');
  });

  it('rejects empty prompt', () => {
    expect(() => assignTaskSchema.parse({
      prompt: '',
      workspaceId: 'OpenSourceWTF/WAAAH'
    })).toThrow();
  });

  it('requires workspaceId', () => {
    expect(() => assignTaskSchema.parse({
      prompt: 'Build something'
    })).toThrow();
  });
});

describe('listAgentsSchema', () => {
  it('accepts empty object', () => {
    expect(listAgentsSchema.parse({})).toBeDefined();
  });

  it('accepts capability filter', () => {
    const result = listAgentsSchema.parse({ capability: 'code-writing' });
    expect(result.capability).toBe('code-writing');
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
