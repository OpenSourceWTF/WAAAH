/**
 * Tests for heartbeat-middleware.ts
 * 
 * Verifies debouncing behavior and agentId extraction.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldSendHeartbeat,
  sendHeartbeatIfNeeded,
  extractAgentId,
  processHeartbeat,
  clearHeartbeatCache
} from '../src/mcp/heartbeat-middleware';

describe('heartbeat-middleware', () => {
  beforeEach(() => {
    clearHeartbeatCache();
  });

  describe('shouldSendHeartbeat', () => {
    it('returns true for first call', () => {
      expect(shouldSendHeartbeat('agent-1')).toBe(true);
    });

    it('returns false immediately after sending', () => {
      sendHeartbeatIfNeeded('agent-1', { heartbeat: vi.fn() });
      expect(shouldSendHeartbeat('agent-1')).toBe(false);
    });

    it('tracks agents independently', () => {
      sendHeartbeatIfNeeded('agent-1', { heartbeat: vi.fn() });
      expect(shouldSendHeartbeat('agent-1')).toBe(false);
      expect(shouldSendHeartbeat('agent-2')).toBe(true);
    });
  });

  describe('sendHeartbeatIfNeeded', () => {
    it('calls heartbeat on first call', () => {
      const heartbeat = vi.fn();
      const result = sendHeartbeatIfNeeded('agent-1', { heartbeat });
      expect(result).toBe(true);
      expect(heartbeat).toHaveBeenCalledWith('agent-1');
    });

    it('does not call heartbeat within debounce period', () => {
      const heartbeat = vi.fn();
      sendHeartbeatIfNeeded('agent-1', { heartbeat });
      heartbeat.mockClear();

      const result = sendHeartbeatIfNeeded('agent-1', { heartbeat });
      expect(result).toBe(false);
      expect(heartbeat).not.toHaveBeenCalled();
    });

    it('debounces rapid calls (simulates spam)', () => {
      const heartbeat = vi.fn();

      // Simulate 100 rapid tool calls
      for (let i = 0; i < 100; i++) {
        sendHeartbeatIfNeeded('agent-1', { heartbeat });
      }

      // Should only have called heartbeat once due to debouncing
      expect(heartbeat).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractAgentId', () => {
    it('extracts agentId from params', () => {
      expect(extractAgentId('update_progress', { agentId: 'agent-1' })).toBe('agent-1');
    });

    it('extracts sourceAgentId from params', () => {
      expect(extractAgentId('assign_task', { sourceAgentId: 'agent-2' })).toBe('agent-2');
    });

    it('prefers agentId over sourceAgentId', () => {
      expect(extractAgentId('test', { agentId: 'agent-1', sourceAgentId: 'agent-2' })).toBe('agent-1');
    });

    it('returns undefined when no agentId present', () => {
      expect(extractAgentId('list_agents', {})).toBeUndefined();
    });
  });

  describe('processHeartbeat', () => {
    it('extracts agentId and sends heartbeat', () => {
      const heartbeat = vi.fn();
      processHeartbeat('update_progress', { agentId: 'agent-1' }, { heartbeat });
      expect(heartbeat).toHaveBeenCalledWith('agent-1');
    });

    it('handles params without agentId gracefully', () => {
      const heartbeat = vi.fn();
      processHeartbeat('list_agents', {}, { heartbeat });
      expect(heartbeat).not.toHaveBeenCalled();
    });

    it('debounces repeated calls for same agent', () => {
      const heartbeat = vi.fn();

      // First call triggers heartbeat
      processHeartbeat('update_progress', { agentId: 'agent-1' }, { heartbeat });
      expect(heartbeat).toHaveBeenCalledTimes(1);

      // Subsequent calls are debounced
      processHeartbeat('get_task_context', { agentId: 'agent-1' }, { heartbeat });
      processHeartbeat('send_response', { agentId: 'agent-1' }, { heartbeat });
      expect(heartbeat).toHaveBeenCalledTimes(1);
    });
  });
});
