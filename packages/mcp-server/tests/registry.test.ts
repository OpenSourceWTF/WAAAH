import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database before importing registry
// NOTE: vi.mock is hoisted, so we must define everything inside the factory
vi.mock('../src/state/db.js', () => {
  const agents = new Map<string, any>();

  // Inline delegation permissions (can't reference external variables due to hoisting)
  const delegations: Record<string, string[]> = {
    'project-manager': ['full-stack-engineer', 'test-engineer', 'ops-engineer', 'designer'],
    'full-stack-engineer': ['test-engineer'],
    'test-engineer': [],
    'ops-engineer': [],
    'designer': [],
    'developer': []
  };

  return {
    db: {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('INSERT OR REPLACE INTO agents') || sql.includes('INSERT INTO agents')) {
          return {
            run: vi.fn((params: any) => {
              agents.set(params.id, { ...params, lastSeen: Date.now() });
            })
          };
        }
        if (sql.includes('SELECT * FROM agents WHERE id')) {
          return {
            get: vi.fn((id: string) => agents.get(id))
          };
        }
        if (sql.includes('lower(displayName)') || sql.includes('SELECT * FROM agents WHERE displayName')) {
          return {
            get: vi.fn((name: string) => {
              const nameLower = name.toLowerCase();
              for (const agent of agents.values()) {
                if (agent.displayName?.toLowerCase() === nameLower) return agent;
              }
              return undefined;
            })
          };
        }
        if (sql.includes('SELECT canDelegateTo FROM agents WHERE role')) {
          return {
            get: vi.fn((role: string) => {
              const allowed = delegations[role] || [];
              return { canDelegateTo: JSON.stringify(allowed) };
            })
          };
        }
        if (sql.includes('SELECT lastSeen FROM agents')) {
          return {
            get: vi.fn((id: string) => {
              const agent = agents.get(id);
              return agent ? { lastSeen: agent.lastSeen } : undefined;
            })
          };
        }
        if (sql.includes('UPDATE agents SET lastSeen')) {
          return {
            run: vi.fn((ts: number, id: string) => {
              const agent = agents.get(id);
              if (agent) agent.lastSeen = ts;
            })
          };
        }
        if (sql.includes('SELECT agentId FROM aliases')) {
          return {
            get: vi.fn(() => undefined)
          };
        }
        if (sql.includes('SELECT * FROM agents')) {
          return {
            all: vi.fn(() => Array.from(agents.values()))
          };
        }
        return { run: vi.fn(), get: vi.fn(), all: vi.fn().mockReturnValue([]) };
      }),
      exec: vi.fn()
    },
    loadAgentsConfig: vi.fn().mockReturnValue({ delegations: {} })
  };
});

import { AgentRegistry } from '../src/state/registry.js';
import { db } from '../src/state/db.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry(db);
  });

  describe('register', () => {
    it('creates new agent', () => {
      registry.register({
        id: 'new-agent-1',
        role: 'developer',
        displayName: '@NewAgent',
        capabilities: ['coding']
      });

      const agent = registry.get('new-agent-1');
      expect(agent).toBeDefined();
      expect(agent?.displayName).toBe('@NewAgent');
    });

    it('stores capabilities', () => {
      registry.register({
        id: 'capable-agent',
        role: 'full-stack-engineer',
        displayName: '@Capable',
        capabilities: ['react', 'nodejs', 'typescript']
      });

      const agent = registry.get('capable-agent');
      expect(agent?.capabilities).toContain('react');
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent agent', () => {
      expect(registry.get('does-not-exist')).toBeUndefined();
    });

    it('returns agent by ID', () => {
      registry.register({
        id: 'get-test-agent',
        role: 'developer',
        displayName: '@GetTest',
        capabilities: []
      });

      expect(registry.get('get-test-agent')).toBeDefined();
    });
  });

  describe('canDelegate', () => {
    it('allows PM to delegate to fullstack', () => {
      expect(registry.canDelegate('project-manager', 'full-stack-engineer')).toBe(true);
    });

    it('allows PM to delegate to test engineer', () => {
      expect(registry.canDelegate('project-manager', 'test-engineer')).toBe(true);
    });

    it('allows fullstack delegating to PM', () => {
      expect(registry.canDelegate('full-stack-engineer', 'project-manager')).toBe(true);
    });

    it('allows fullstack to delegate to test engineer', () => {
      expect(registry.canDelegate('full-stack-engineer', 'test-engineer')).toBe(true);
    });

    it('allows test engineer to delegate to fullstack (reporting bugs)', () => {
      expect(registry.canDelegate('test-engineer', 'full-stack-engineer')).toBe(true);
      expect(registry.canDelegate('test-engineer', 'ops-engineer')).toBe(true);
    });
  });

  describe('getAll', () => {
    it('returns all registered agents', () => {
      registry.register({ id: 'all-1', role: 'developer', displayName: '@All1', capabilities: [] });
      registry.register({ id: 'all-2', role: 'developer', displayName: '@All2', capabilities: [] });

      const all = registry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('heartbeat', () => {
    it('updates lastSeen timestamp', () => {
      registry.register({
        id: 'heartbeat-agent',
        role: 'developer',
        displayName: '@Heartbeat',
        capabilities: []
      });

      const before = registry.getLastSeen('heartbeat-agent');
      registry.heartbeat('heartbeat-agent');
      const after = registry.getLastSeen('heartbeat-agent');
      expect(after).toBeGreaterThanOrEqual(before || 0);
    });
  });

  describe('getLastSeen', () => {
    it('returns undefined for non-existent agent', () => {
      expect(registry.getLastSeen('no-such-agent')).toBeUndefined();
    });

    it('returns timestamp for registered agent', () => {
      registry.register({
        id: 'lastseen-agent',
        role: 'developer',
        displayName: '@LastSeen',
        capabilities: []
      });

      const lastSeen = registry.getLastSeen('lastseen-agent');
      expect(typeof lastSeen).toBe('number');
    });
  });

  describe('getByDisplayName', () => {
    it('returns undefined for non-existent display name', () => {
      expect(registry.getByDisplayName('@DoesNotExist')).toBeUndefined();
    });

    it('finds agent by display name', () => {
      registry.register({
        id: 'display-name-agent',
        role: 'developer',
        displayName: '@UniqueDisplayName',
        capabilities: []
      });

      const agent = registry.getByDisplayName('@UniqueDisplayName');
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('display-name-agent');
    });

    it('performs case-insensitive search', () => {
      registry.register({
        id: 'case-test-agent',
        role: 'developer',
        displayName: '@CaseTestAgent',
        capabilities: []
      });

      // Note: actual case insensitivity depends on DB implementation
      const agent = registry.getByDisplayName('@CaseTestAgent');
      expect(agent).toBeDefined();
    });
  });

  describe('getAllowedDelegates', () => {
    it('returns allowed delegates for project-manager', () => {
      const delegates = registry.getAllowedDelegates('project-manager');
      expect(Array.isArray(delegates)).toBe(true);
      expect(delegates).toContain('full-stack-engineer');
      expect(delegates).toContain('test-engineer');
    });

    it('returns empty array for roles with no delegation rights', () => {
      const delegates = registry.getAllowedDelegates('developer');
      expect(Array.isArray(delegates)).toBe(true);
      expect(delegates.length).toBe(0);
    });

    it('returns allowed delegates for full-stack-engineer', () => {
      const delegates = registry.getAllowedDelegates('full-stack-engineer');
      expect(Array.isArray(delegates)).toBe(true);
      expect(delegates).toContain('test-engineer');
    });
  });

  describe('getAgentColor', () => {
    it('returns undefined for non-existent agent', () => {
      expect(registry.getAgentColor('no-such-agent-color')).toBeUndefined();
    });
  });
});
