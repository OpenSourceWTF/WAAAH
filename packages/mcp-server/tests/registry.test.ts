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
        if (sql.includes('SELECT * FROM agents WHERE displayName')) {
          return {
            get: vi.fn((name: string) => {
              for (const agent of agents.values()) {
                if (agent.displayName === name) return agent;
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

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
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

    it('denies fullstack delegating to PM', () => {
      expect(registry.canDelegate('full-stack-engineer', 'project-manager')).toBe(false);
    });

    it('allows fullstack to delegate to test engineer', () => {
      expect(registry.canDelegate('full-stack-engineer', 'test-engineer')).toBe(true);
    });

    it('denies test engineer delegating to anyone', () => {
      expect(registry.canDelegate('test-engineer', 'full-stack-engineer')).toBe(false);
      expect(registry.canDelegate('test-engineer', 'project-manager')).toBe(false);
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
});
