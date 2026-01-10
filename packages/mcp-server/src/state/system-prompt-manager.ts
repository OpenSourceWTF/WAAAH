
import type { Database } from 'better-sqlite3';

/**
 * Manages system prompts backed by the database.
 */
export class SystemPromptManager {
  constructor(private readonly db: Database) {}

  queueSystemPrompt(
    agentId: string,
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE',
    message: string,
    payload?: Record<string, unknown>,
    priority?: 'normal' | 'high' | 'critical'
  ): void {
    this.db.prepare(
      'INSERT INTO system_prompts (agentId, promptType, message, payload, priority, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(agentId, promptType, message, payload ? JSON.stringify(payload) : null, priority || 'normal', Date.now());

    console.log(`[SystemPromptManager] Queued system prompt for ${agentId}: ${promptType}`);
  }

  popSystemPrompt(agentId: string): {
    promptType: 'WORKFLOW_UPDATE' | 'EVICTION_NOTICE' | 'CONFIG_UPDATE' | 'SYSTEM_MESSAGE';
    message: string;
    payload?: Record<string, unknown>;
    priority?: 'normal' | 'high' | 'critical';
  } | null {
    // Try agent-specific prompt first
    let row = this.db.prepare(
      'SELECT id, promptType, message, payload, priority FROM system_prompts WHERE agentId = ? ORDER BY createdAt ASC LIMIT 1'
    ).get(agentId) as any;

    // Fall back to broadcast prompts
    if (!row) {
      row = this.db.prepare(
        'SELECT id, promptType, message, payload, priority FROM system_prompts WHERE agentId = ? ORDER BY createdAt ASC LIMIT 1'
      ).get('*') as any;
    }

    if (row) {
      // Delete the consumed prompt
      this.db.prepare('DELETE FROM system_prompts WHERE id = ?').run(row.id);

      return {
        promptType: row.promptType,
        message: row.message,
        payload: row.payload ? JSON.parse(row.payload) : undefined,
        priority: row.priority
      };
    }

    return null;
  }
}
