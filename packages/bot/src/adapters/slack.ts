/**
 * Slack Platform Adapter
 */
import { App, MessageEvent, SayFn } from '@slack/bolt';
import { PlatformAdapter, MessageContext, MessageHandler, EmbedData } from './interface.js';

export class SlackAdapter implements PlatformAdapter {
  readonly platform = 'slack' as const;
  private app: App;
  private messageHandler?: MessageHandler;
  private replyCache = new Map<string, { channel: string; ts: string }>();

  constructor(
    private token: string,
    private signingSecret: string,
    private appToken: string,
    private approvedUsers: Set<string>
  ) {
    this.app = new App({
      token: this.token,
      signingSecret: this.signingSecret,
      socketMode: true,
      appToken: this.appToken
    });
  }

  async connect(): Promise<void> {
    // Listen for app_mention events (when bot is @mentioned)
    this.app.event('app_mention', async ({ event, say, client }) => {
      const userId = event.user ?? 'unknown';

      // Filter approved users
      if (this.approvedUsers.size > 0 && !this.approvedUsers.has(userId)) {
        return;
      }

      // Remove the bot mention from the text
      const content = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();

      const context: MessageContext = {
        messageId: event.ts,
        channelId: event.channel,
        serverId: event.team ?? undefined,
        authorId: userId,
        authorName: userId, // Slack doesn't include name in event
        platform: 'slack',
        raw: { event, say, client }
      };

      if (this.messageHandler) {
        await this.messageHandler(content, context);
      }
    });

    await this.app.start();
    console.log('[Slack] Bot connected via Socket Mode');
  }

  async disconnect(): Promise<void> {
    await this.app.stop();
  }

  async reply(context: MessageContext, message: string): Promise<string> {
    const { say } = context.raw as { say: SayFn };
    const result = await say({
      text: message,
      thread_ts: context.messageId // Reply in thread
    });

    const ts = (result as any).ts;
    this.replyCache.set(`${context.messageId}:reply`, {
      channel: context.channelId,
      ts
    });
    return ts;
  }

  async editReply(context: MessageContext, _replyId: string, message: string): Promise<void> {
    const { client } = context.raw as { client: any };
    const cached = this.replyCache.get(`${context.messageId}:reply`);

    if (cached) {
      await client.chat.update({
        channel: cached.channel,
        ts: cached.ts,
        text: message
      });
    }
  }

  async sendEmbed(channelId: string, embed: EmbedData): Promise<void> {
    // Slack uses "blocks" for rich formatting
    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: embed.title }
      },
      {
        type: 'section',
        fields: embed.fields.map(f => ({
          type: 'mrkdwn',
          text: `*${f.name}*\n${f.value}`
        }))
      }
    ];

    await this.app.client.chat.postMessage({
      channel: channelId,
      text: embed.title,
      blocks
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}
