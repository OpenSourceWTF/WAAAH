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

    // Listen for slash command /waaah
    this.app.command('/waaah', async ({ command, ack, say, client }) => {
      await ack();

      const userId = command.user_id;

      // Filter approved users
      if (this.approvedUsers.size > 0 && !this.approvedUsers.has(userId)) {
        await client.chat.postEphemeral({
          channel: command.channel_id,
          user: userId,
          text: "You are not authorized to use this bot."
        });
        return;
      }

      const content = command.text.trim();

      // For slash commands, we don't have a message TS to thread on by default,
      // but we can just use the channel. Or we can post a message first?
      // Actually, let's just use the channel ID.
      // BotCore expects to reply to messageId. For Slash Commands, we can't reply in thread effectively unless we post a message first.
      // But typically slash commands are ephemeral or start a new thread.
      // Let's treat it as a new message.

      const context: MessageContext = {
        messageId: command.trigger_id, // Use trigger_id as messageId reference (though it's not a message ts)
        channelId: command.channel_id,
        serverId: command.team_id,
        authorId: userId,
        authorName: command.user_name,
        platform: 'slack',
        // Start a new thread for the response?
        // If we want the bot to reply in a thread, we need a parent message TS.
        // Slash commands don't generate a parent message unless we post one.
        // For now, let's just reply in main channel if no thread TS.
        // Modified SlackAdapter.reply will handle it.
        raw: { command, say, client }
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
    const { say, event } = context.raw as { say: SayFn; event?: MessageEvent };

    // If this is a slash command, we don't have a message TS to thread on
    const isSlashCommand = !!(context.raw as any).command;

    // Check if we should force threading or if we're already in a thread
    const forceThread = process.env.SLACK_FORCE_THREADING === 'true';
    const eventAny = event as any;
    const isInThread = eventAny?.thread_ts !== undefined;

    // Determine thread_ts
    let threadTs: string | undefined;
    if (isSlashCommand) {
      threadTs = undefined; // Slash commands don't have a parent to thread on
    } else if (forceThread) {
      threadTs = context.messageId; // Force threading to original message
    } else if (isInThread) {
      threadTs = eventAny.thread_ts; // Reply in existing thread
    } else {
      threadTs = undefined; // Main channel message → reply in channel, not thread
    }

    const result = await say({
      text: message,
      thread_ts: threadTs
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
