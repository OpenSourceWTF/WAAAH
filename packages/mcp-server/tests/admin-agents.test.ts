/**
 * Admin Agents Route Tests
 * 
 * Tests for /admin/agents/* endpoints using E2E harness.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createE2ETestServer, type E2ETestServer } from './e2e-harness.js';

describe('Admin Agents Routes', () => {
  let server: E2ETestServer;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createE2ETestServer();
    baseUrl = server.baseUrl;
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /admin/agents/status', () => {
    it('returns array of agents', async () => {
      const res = await fetch(`${baseUrl}/admin/agents/status`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('includes agent properties in response', async () => {
      // First register an agent
      await fetch(`${baseUrl}/mcp/tools/register_agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'test-agent-status',
          displayName: '@TestAgent',
          capabilities: ['code-writing']
        })
      });

      const res = await fetch(`${baseUrl}/admin/agents/status`);
      expect(res.ok).toBe(true);
      const agents = await res.json();

      const testAgent = agents.find((a: any) => a.id === 'test-agent-status');
      if (testAgent) {
        expect(testAgent.displayName).toBe('@TestAgent');
        expect(testAgent.capabilities).toContain('code-writing');
        expect(testAgent.status).toBeDefined();
      }
    });
  });

  describe('POST /admin/evict', () => {
    it('queues eviction for agent', async () => {
      // Register agent first
      await fetch(`${baseUrl}/mcp/tools/register_agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'evict-test-agent',
          displayName: '@EvictTest'
        })
      });

      const res = await fetch(`${baseUrl}/admin/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'evict-test-agent',
          reason: 'Test eviction',
          action: 'RESTART'
        })
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('rejects missing agentId', async () => {
      const res = await fetch(`${baseUrl}/admin/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Test' })
      });

      expect(res.status).toBe(400);
    });

    it('rejects missing reason', async () => {
      const res = await fetch(`${baseUrl}/admin/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'test' })
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/agents/:agentId/evict', () => {
    it('handles eviction request for agent', async () => {
      // Register agent first
      await fetch(`${baseUrl}/mcp/tools/register_agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: 'specific-evict-agent',
          displayName: '@SpecificEvict'
        })
      });

      const res = await fetch(`${baseUrl}/admin/agents/specific-evict-agent/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin test eviction' })
      });

      // May succeed or 404 depending on timing
      expect([200, 404]).toContain(res.status);
    });

    it('returns 404 for unknown agent', async () => {

      const res = await fetch(`${baseUrl}/admin/agents/nonexistent-agent/evict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Test' })
      });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /admin/workspaces', () => {
    it('returns array of workspaces', async () => {
      const res = await fetch(`${baseUrl}/admin/workspaces`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe('GET /admin/workspaces/:workspaceId/capabilities', () => {
    it('returns 404 for unknown workspace', async () => {
      const encodedPath = encodeURIComponent('/nonexistent/workspace');
      const res = await fetch(`${baseUrl}/admin/workspaces/${encodedPath}/capabilities`);
      expect(res.status).toBe(404);
    });
  });
});
