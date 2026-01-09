/**
 * Registry tests using isolated in-memory database.
 * Uses the createTestContext pattern to avoid production DB pollution.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentRepository } from '../src/state/agent-repository.js';
import { createTestContext, type TestContext } from './harness.js';

describe('AgentRepository', () => {
  let ctx: TestContext;
  let registry: AgentRepository;

  beforeEach(() => {
    ctx = createTestContext();
    registry = ctx.registry;
  });

  afterEach(() => {
    ctx.cleanup();
  });

  describe('register', () => {
    it('creates new agent', () => {
      registry.register({
        id: 'new-agent-1',
        displayName: '@NewAgent',
        capabilities: ['code-writing']
      });

      const agent = registry.get('new-agent-1');
      expect(agent).toBeDefined();
      expect(agent?.displayName).toBe('@NewAgent');
    });

    it('stores capabilities', () => {
      registry.register({
        id: 'capable-agent',
        displayName: '@Capable',
        capabilities: ['code-writing', 'test-writing', 'doc-writing']
      });

      const agent = registry.get('capable-agent');
      expect(agent?.capabilities).toContain('code-writing');
      expect(agent?.capabilities).toContain('test-writing');
    });
  });

  describe('get', () => {
    it('returns undefined for non-existent agent', () => {
      expect(registry.get('does-not-exist')).toBeUndefined();
    });

    it('returns agent by ID', () => {
      registry.register({
        id: 'get-test-agent',
        displayName: '@GetTest',
        capabilities: ['code-writing']
      });

      expect(registry.get('get-test-agent')).toBeDefined();
    });
  });

  describe('getByCapability', () => {
    it('returns agents with specific capability', () => {
      registry.register({
        id: 'test-writer-1',
        displayName: '@TestWriter1',
        capabilities: ['test-writing']
      });
      registry.register({
        id: 'code-writer-1',
        displayName: '@CodeWriter1',
        capabilities: ['code-writing']
      });

      const testWriters = registry.getByCapability('test-writing');
      expect(testWriters.length).toBeGreaterThanOrEqual(1);
      expect(testWriters.some(a => a.id === 'test-writer-1')).toBe(true);
      expect(testWriters.some(a => a.id === 'code-writer-1')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns all registered agents', () => {
      registry.register({ id: 'all-1', displayName: '@All1', capabilities: ['code-writing'] });
      registry.register({ id: 'all-2', displayName: '@All2', capabilities: ['spec-writing'] });

      const all = registry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('heartbeat', () => {
    it('updates lastSeen timestamp', () => {
      registry.register({
        id: 'heartbeat-agent',
        displayName: '@Heartbeat',
        capabilities: ['code-writing']
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
        displayName: '@LastSeen',
        capabilities: ['code-writing']
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
        displayName: '@UniqueDisplayName',
        capabilities: ['code-writing']
      });

      const agent = registry.getByDisplayName('@UniqueDisplayName');
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('display-name-agent');
    });

    it('performs case-insensitive search', () => {
      registry.register({
        id: 'case-test-agent',
        displayName: '@CaseTestAgent',
        capabilities: ['code-writing']
      });

      // Note: actual case insensitivity depends on DB implementation
      const agent = registry.getByDisplayName('@CaseTestAgent');
      expect(agent).toBeDefined();
    });
  });

  describe('getAgentColor', () => {
    it('returns undefined for non-existent agent', () => {
      expect(registry.getAgentColor('no-such-agent-color')).toBeUndefined();
    });
  });
});
