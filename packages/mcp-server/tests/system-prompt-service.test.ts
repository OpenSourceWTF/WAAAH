/**
 * System Prompt Service Tests
 * 
 * Tests for system prompt queue and consumption.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { SystemPromptService } from '../src/state/services/system-prompt-service.js';
import { initializeSchema } from '../src/state/persistence/database-factory.js';

describe('SystemPromptService', () => {
  let db: Database.Database;
  let service: SystemPromptService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeSchema(db);
    service = new SystemPromptService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('queueSystemPrompt', () => {
    it('queues a system prompt for an agent', () => {
      service.queueSystemPrompt('agent-1', 'SYSTEM_MESSAGE', 'Hello agent');

      const row = db.prepare('SELECT * FROM system_prompts WHERE agentId = ?').get('agent-1') as any;
      expect(row).toBeDefined();
      expect(row.message).toBe('Hello agent');
      expect(row.promptType).toBe('SYSTEM_MESSAGE');
    });

    it('queues prompt with payload', () => {
      service.queueSystemPrompt('agent-2', 'CONFIG_UPDATE', 'Config changed', { key: 'value' });

      const row = db.prepare('SELECT payload FROM system_prompts WHERE agentId = ?').get('agent-2') as any;
      expect(JSON.parse(row.payload)).toEqual({ key: 'value' });
    });

    it('queues prompt with priority', () => {
      service.queueSystemPrompt('agent-3', 'EVICTION_NOTICE', 'Evicting', undefined, 'critical');

      const row = db.prepare('SELECT priority FROM system_prompts WHERE agentId = ?').get('agent-3') as any;
      expect(row.priority).toBe('critical');
    });

    it('queues broadcast prompt for all agents', () => {
      service.queueSystemPrompt('*', 'WORKFLOW_UPDATE', 'Workflow changed');

      const row = db.prepare('SELECT * FROM system_prompts WHERE agentId = ?').get('*') as any;
      expect(row.message).toBe('Workflow changed');
    });
  });

  describe('popSystemPrompt', () => {
    it('pops and removes agent-specific prompt', () => {
      service.queueSystemPrompt('agent-4', 'SYSTEM_MESSAGE', 'Pop me');

      const prompt = service.popSystemPrompt('agent-4');

      expect(prompt).toEqual({
        promptType: 'SYSTEM_MESSAGE',
        message: 'Pop me',
        payload: undefined,
        priority: 'normal'
      });

      // Should be removed
      const remaining = db.prepare('SELECT * FROM system_prompts WHERE agentId = ?').all('agent-4');
      expect(remaining).toHaveLength(0);
    });

    it('returns null when no prompt available', () => {
      const prompt = service.popSystemPrompt('nonexistent');
      expect(prompt).toBeNull();
    });

    it('returns prompts in FIFO order', () => {
      service.queueSystemPrompt('agent-5', 'SYSTEM_MESSAGE', 'First');
      service.queueSystemPrompt('agent-5', 'SYSTEM_MESSAGE', 'Second');

      const first = service.popSystemPrompt('agent-5');
      const second = service.popSystemPrompt('agent-5');

      expect(first?.message).toBe('First');
      expect(second?.message).toBe('Second');
    });

    it('parses payload JSON', () => {
      service.queueSystemPrompt('agent-6', 'CONFIG_UPDATE', 'Config', { setting: true });

      const prompt = service.popSystemPrompt('agent-6');

      expect(prompt?.payload).toEqual({ setting: true });
    });
  });
});
