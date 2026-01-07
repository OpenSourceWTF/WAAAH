import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import { BotCore, BotCoreConfig } from './bot';
import { PlatformAdapter, MessageContext } from '../adapters/interface';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock fs and yaml
vi.mock('fs');
vi.mock('js-yaml');
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedYaml = yaml as jest.Mocked<typeof yaml>;

// Mock PlatformAdapter
const mockAdapter: PlatformAdapter = {
  platform: 'test-platform',
  connect: vi.fn(),
  disconnect: vi.fn(),
  onMessage: vi.fn(),
  reply: vi.fn(),
  editReply: vi.fn(),
  react: vi.fn(),
  sendEmbed: vi.fn(),
};

describe('BotCore', () => {
  let bot: BotCore;
  let config: BotCoreConfig;
  let messageHandler: (content: string, context: MessageContext) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default config mock
    mockedFs.readFileSync.mockReturnValue('agents: {}');
    mockedYaml.load.mockReturnValue({
      agents: {
        'test-engineer': { displayName: '@TestEng', aliases: ['tester'] }
      }
    });

    config = {
      mcpServerUrl: 'http://localhost:3000',
      apiKey: 'test-api-key',
      configPath: '/dummy/config.yaml'
    };
    bot = new BotCore(mockAdapter, config);


    // Capture the message handler when start() is called
    mockAdapter.onMessage.mockImplementation((handler) => {
      messageHandler = handler;
    });
  });

  describe('start', () => {
    it('initializes adapter and connects', async () => {
      await bot.start();
      expect(mockAdapter.onMessage).toHaveBeenCalled();
      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(axios.defaults.headers.common['X-API-Key']).toBe('test-api-key');
      expect(mockedFs.readFileSync).toHaveBeenCalledWith('/dummy/config.yaml', 'utf8');
    });
  });

  describe('handleMessage (Commands)', () => {
    const context: MessageContext = {
      platform: 'test',
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
      // Fake timers for polling
      vi.useFakeTimers();

      await messageHandler('@TestEng check this', context);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/admin/enqueue'),
        expect.objectContaining({
          prompt: 'check this',
          role: expect.any(String), // aliases might map @testeng to something
        })
      );

      expect(mockAdapter.reply).toHaveBeenCalledWith(
        context,
        expect.stringContaining('Task Scheduled')
      );

      vi.useRealTimers();
    });
  });
});
