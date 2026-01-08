import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { BaseAdapter } from './base-adapter.js';
import { MessageContext, EmbedData } from './interface.js';
import { toDiscordEmbed, toSlackBlocks } from './embed-formatter.js';

import { EmbedBuilder } from 'discord.js';

// === Scenario 1: BaseAdapter Caching Logic ===

class TestAdapter extends BaseAdapter {
  platform = 'discord' as const;

  constructor() {
    super(new Set());
  }

  async performConnect() { }
  async disconnect() { }
  async reply(ctx: MessageContext, msg: string) { return 'reply-id'; }
  async editReply(ctx: MessageContext, id: string, msg: string) { }
  async sendEmbed(channelId: string, embed: EmbedData) { }

  // Public helpers for testing protected methods
  public testCacheReply(contextId: string, reply: unknown) {
    this.cacheReply(contextId, reply);
  }
  public testGetCachedReply<T>(contextId: string): T | undefined {
    return this.getCachedReply<T>(contextId);
  }
  // Expose protected method for testing
  public testShouldReplyInThread(context: MessageContext, envKey: string): boolean {
    // @ts-ignore - Accessing protected method
    return (this as any).shouldReplyInThread(context, envKey);
  }
}

describe('BaseAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should cache and retrieve reply objects', () => {
    const adapter = new TestAdapter();
    const contextId = 'ctx-123';
    const replyObj = { id: 'msg-abc', text: 'hello' };

    adapter.testCacheReply(contextId, replyObj);
    const cached = adapter.testGetCachedReply(contextId);

    expect(cached).toBe(replyObj); // Exact reference match
    expect(adapter.testGetCachedReply('non-existent')).toBeUndefined();
  });

  // === Scenario 5: Threading Strategy ===
  describe('shouldReplyInThread', () => {
    it('should return true if FORCE_THREADING env var is "true"', () => {
      process.env['TEST_FORCE_THREADING'] = 'true';
      const adapter = new TestAdapter();
      const ctx = { isThread: false } as any as MessageContext;
      expect(adapter.testShouldReplyInThread(ctx, 'TEST_FORCE_THREADING')).toBe(true);
    });

    it('should return true if context.isThread is true', () => {
      const adapter = new TestAdapter();
      const ctx = { isThread: true } as any as MessageContext;
      expect(adapter.testShouldReplyInThread(ctx, 'TEST_FORCE_THREADING')).toBe(true);
    });

    it('should return false if neither condition is met', () => {
      const adapter = new TestAdapter();
      const ctx = { isThread: false } as any as MessageContext;
      expect(adapter.testShouldReplyInThread(ctx, 'TEST_FORCE_THREADING')).toBe(false);
    });

    it('should be case-sensitive for env var (only "true" works)', () => {
      process.env['TEST_FORCE_THREADING'] = 'TRUE';
      const adapter = new TestAdapter();
      const ctx = { isThread: false } as any as MessageContext;
      expect(adapter.testShouldReplyInThread(ctx, 'TEST_FORCE_THREADING')).toBe(false);
    });
  });
});

// === Scenario 2: Embed Formatter (Discord) ===

describe('EmbedFormatter - toDiscordEmbed', () => {
  it('should convert Unified EmbedData to Discord EmbedBuilder', () => {
    const timestamp = Date.now();
    const data: EmbedData = {
      title: 'Test Title',
      color: '#ff0000',
      fields: [
        { name: 'Field 1', value: 'Value 1', inline: true },
        { name: 'Field 2', value: 'Value 2', inline: false }
      ],
      timestamp
    };

    const discordEmbed = toDiscordEmbed(data);

    expect(discordEmbed).toBeInstanceOf(EmbedBuilder);
    const json = discordEmbed.toJSON();

    expect(json.title).toBe('Test Title');
    expect(json.color).toBe(16711680); // #ff0000 -> int
    expect(json.fields).toHaveLength(2);
    expect(json.fields![0]).toEqual({ name: 'Field 1', value: 'Value 1', inline: true });
    expect(json.fields![1]).toEqual({ name: 'Field 2', value: 'Value 2', inline: false });
    expect(new Date(json.timestamp!).getTime()).toBe(timestamp);
  });

  it('should handle missing optional fields', () => {
    const data: EmbedData = {
      title: 'Simple',
      fields: []
    };
    const discordEmbed = toDiscordEmbed(data);
    const json = discordEmbed.toJSON();

    expect(json.title).toBe('Simple');
    expect(json.color).toBe(7506394); // #7289da default
    expect(json.fields).toBeUndefined();
    expect(json.timestamp).toBeUndefined();
  });
});

// === Scenario 3: Embed Formatter (Slack) ===

describe('EmbedFormatter - toSlackBlocks', () => {
  it('should convert Unified EmbedData to Slack Blocks', () => {
    const timestamp = 1700000000000;
    const data: EmbedData = {
      title: 'Slack Title',
      fields: [
        { name: 'Key', value: 'Val' }
      ],
      timestamp
    };

    const blocks = toSlackBlocks(data);

    expect(blocks).toHaveLength(3); // Header, Section, Context (Timestamp)

    // Header
    expect(blocks[0]).toEqual({
      type: 'header',
      text: { type: 'plain_text', text: 'Slack Title', emoji: true }
    });

    // Section (Fields)
    expect(blocks[1].type).toBe('section');
    expect(blocks[1].fields).toHaveLength(1);
    expect(blocks[1].fields[0]).toEqual({
      type: 'mrkdwn',
      text: '*Key*\nVal'
    });

    // Context (Timestamp)
    expect(blocks[2].type).toBe('context');
    expect(blocks[2].elements[0].text).toContain(new Date(timestamp).toLocaleString());
  });

  it('should omit timestamp block if not provided', () => {
    const data: EmbedData = {
      title: 'No Timestamp',
      fields: []
    };
    const blocks = toSlackBlocks(data);
    expect(blocks).toHaveLength(2); // Header, Section only
    expect(blocks.find(b => b.type === 'context')).toBeUndefined();
  });
});

// === Scenario 4 Removed: Belonged to @opensourcewtf/waaah-types package ===
