import { describe, it, expect, vi, beforeEach, afterEach, type Mocked } from 'vitest';
import axios from 'axios';
import { BotCore, BotCoreConfig } from './bot';
import { PlatformAdapter, MessageContext } from '../adapters/interface';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

// Mock PlatformAdapter
const mockAdapter = {
  platform: 'discord',
  connect: vi.fn(),
  disconnect: vi.fn(),
  onMessage: vi.fn(),
  reply: vi.fn(),
  editReply: vi.fn(),
  react: vi.fn(),
  sendEmbed: vi.fn(),
} as unknown as Mocked<PlatformAdapter>;

describe('BotCore', () => {
  let bot: BotCore;
  let config: BotCoreConfig;
  let messageHandler: (content: string, context: MessageContext) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock dynamic alias loading from MCP server
    mockedAxios.get.mockImplementation(async (url: string) => {
      if (url.includes('/admin/agents/status')) {
        return {
          data: [
            { displayName: '@TestEng', role: 'test-engineer' },
            { displayName: '@FullStack', role: 'full-stack-engineer' }
          ]
        };
      }
      throw new Error(`Unexpected GET: ${url}`);
    });

    config = {
      mcpServerUrl: 'http://localhost:3000',
      apiKey: 'test-api-key'
    };
    bot = new BotCore(mockAdapter, config);

    // Capture the message handler when start() is called
    mockAdapter.onMessage.mockImplementation((handler) => {
      messageHandler = handler;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('initializes adapter and connects', async () => {
      await bot.start();

      expect(mockAdapter.onMessage).toHaveBeenCalled();
      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(axios.defaults.headers.common['X-API-Key']).toBe('test-api-key');
      // Verify dynamic aliases were loaded
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/admin/agents/status')
      );
    });

    it('handles failed dynamic alias loading gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      // Should not throw - just log warning
      await expect(bot.start()).resolves.not.toThrow();
      expect(mockAdapter.connect).toHaveBeenCalled();
    });
  });

  describe('handleMessage (Commands)', () => {
    const context: MessageContext = {
      platform: 'discord',
      channelId: 'C123',
      serverId: 'S123',
      messageId: 'M123',
      authorId: 'U123',
      authorName: 'TestUser',
    };

    beforeEach(async () => {
      await bot.start(); // Helper to bind messageHandler
    });

    it('handles status command', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { content: [{ text: JSON.stringify([]) }] }
      });

      await messageHandler('status', context);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/mcp/tools/list_agents'),
        {}
      );
      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('WAAAH Bot Online')
      );
    });

    it('handles clear command', async () => {
      mockedAxios.post.mockResolvedValueOnce({});

      await messageHandler('clear', context);

      expect(mockedAxios.post).toHaveBeenCalledWith(expect.stringContaining('/admin/queue/clear'));
      expect(mockAdapter.reply).toHaveBeenCalledWith(context, expect.stringContaining('Queue cleared'));
    });

    it('blocks unassigned tasks', async () => {
      await messageHandler('do something random', context);

      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Please specify a target agent')
      );
    });

    it('enqueues task when target agent is specified', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { taskId: 'task-123' } });
      vi.useFakeTimers();

      await messageHandler('@TestEng check this', context);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/admin/enqueue'),
        expect.objectContaining({
          prompt: 'check this',
          role: 'test-engineer',
        })
      );

      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Task Scheduled')
      );

      vi.useRealTimers();
    });

    it('handles update command', async () => {
      mockedAxios.post.mockResolvedValueOnce({});

      await messageHandler('update agent-1 name=NewName color=#FF0000', context);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/mcp/tools/admin_update_agent'),
        expect.objectContaining({
          agentId: 'agent-1',
          displayName: 'NewName',
          color: '#FF0000'
        })
      );
      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Updated agent')
      );
    });

    it('handles answer command', async () => {
      mockedAxios.post.mockResolvedValueOnce({});

      await messageHandler('answer task-123 Yes, that looks correct', context);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/mcp/tools/answer_task'),
        expect.objectContaining({
          taskId: 'task-123',
          answer: 'Yes, that looks correct'
        })
      );
      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Answered task')
      );
    });

    it('shows usage for update command without target', async () => {
      await messageHandler('update', context);

      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Usage:')
      );
    });

    it('shows usage for answer command without args', async () => {
      await messageHandler('answer', context);

      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Usage:')
      );
    });
  });
});
