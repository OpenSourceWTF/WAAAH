
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SystemPromptManager } from '../src/state/system-prompt-manager.js';

describe('SystemPromptManager', () => {
  let manager: SystemPromptManager;
  let mockDb: any;
  let mockRun: any;
  let mockGet: any;

  beforeEach(() => {
    mockRun = vi.fn();
    mockGet = vi.fn();
    mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: mockRun,
        get: mockGet
      })
    };
    manager = new SystemPromptManager(mockDb);
    vi.clearAllMocks();
  });

  describe('queueSystemPrompt', () => {
    it('should insert prompt into database', () => {
      manager.queueSystemPrompt('agent-1', 'SYSTEM_MESSAGE', 'Hello');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO system_prompts'));
      expect(mockRun).toHaveBeenCalledWith(
        'agent-1', 'SYSTEM_MESSAGE', 'Hello', null, 'normal', expect.any(Number)
      );
    });

    it('should handle payload and priority', () => {
      const payload = { foo: 'bar' };
      manager.queueSystemPrompt('agent-1', 'CONFIG_UPDATE', 'Update', payload, 'high');
      expect(mockRun).toHaveBeenCalledWith(
        'agent-1', 'CONFIG_UPDATE', 'Update', JSON.stringify(payload), 'high', expect.any(Number)
      );
    });
  });

  describe('popSystemPrompt', () => {
    it('should return null if no prompts found', () => {
      mockGet.mockReturnValue(undefined); // First for agent specific
      // And second for broadcast (it calls prepare twice)
      
      const result = manager.popSystemPrompt('agent-1');
      expect(result).toBeNull();
    });

    it('should return agent-specific prompt first', () => {
      const prompt = {
        id: 1,
        promptType: 'SYSTEM_MESSAGE',
        message: 'Hello',
        payload: null,
        priority: 'normal'
      };
      mockGet.mockReturnValueOnce(prompt);

      const result = manager.popSystemPrompt('agent-1');
      expect(result).toEqual({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Hello',
        payload: undefined,
        priority: 'normal'
      });
      
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM system_prompts'));
      expect(mockRun).toHaveBeenCalledWith(1);
    });

    it('should return broadcast prompt if no agent-specific prompt', () => {
      mockGet.mockReturnValueOnce(undefined); // No agent specific
      
      const prompt = {
        id: 2,
        promptType: 'EVICTION_NOTICE',
        message: 'Evict',
        payload: '{"reason":"test"}',
        priority: 'critical'
      };
      mockGet.mockReturnValueOnce(prompt); // Broadcast found

      const result = manager.popSystemPrompt('agent-1');
      expect(result).toEqual({
        promptType: 'EVICTION_NOTICE',
        message: 'Evict',
        payload: { reason: 'test' },
        priority: 'critical'
      });
      
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM system_prompts'));
      expect(mockRun).toHaveBeenCalledWith(2);
    });
  });
});
