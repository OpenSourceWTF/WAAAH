/**
 * Slack Platform Adapter
 */
import { App, MessageEvent, SayFn } from '@slack/bolt';
import { BaseAdapter } from './base-adapter.js';
import { MessageContext, EmbedData } from './interface.js';
import { toSlackBlocks } from './embed-formatter.js';

export class SlackAdapter extends BaseAdapter {
  readonly platform = 'slack' as const;
  private app: App;

  constructor(
    private token: string,
    private signingSecret: string,
    private appToken: string,
    approvedUsers: Set<string>
  ) {
    super(approvedUsers);
    this.app = new App({
      token: this.token,
      signingSecret: this.signingSecret,
      socketMode: true,
      appToken: this.appToken
    });
  }

  async performConnect(): Promise<void> {
    // Listen for app_mention events (when bot is @mentioned)
    this.app.event('app_mention', async ({ event, say, client }) => {
      const userId = event.user ?? 'unknown';

      // Remove the bot mention from the text
      const content = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
      const eventAny = event as any;

      const context: MessageContext = {
        messageId: event.ts,
        channelId: event.channel,
        serverId: event.team ?? undefined,
        authorId: userId,
        authorName: userId, // Slack doesn't include name in event
        platform: 'slack',
        raw: { event, say, client },
        isThread: !!eventAny.thread_ts,
        threadId: eventAny.thread_ts
      };

      await this.processMessage(content, context);
    });

    // Listen for slash command /waaah
    this.app.command('/waaah', async ({ command, ack, say, client }) => {
      await ack();

      const userId = command.user_id;

      const content = command.text.trim();

      const context: MessageContext = {
        messageId: command.trigger_id, // Use trigger_id as reference
        channelId: command.channel_id,
        serverId: command.team_id,
        authorId: userId,
        authorName: command.user_name,
        platform: 'slack',
        // Start a new thread for the response?
        // If we want the bot to reply in a thread, we need a parent message TS.
        // Slash commands don't generate a parent message unless we post one.
        // For now, let's just reply in main channel if no thread TS.
        raw: { command, say, client },
        isThread: false,
        threadId: undefined
      };

      await this.processMessage(content, context);
    });

    await this.app.start();
    this.log('Bot connected via Socket Mode');
  }

  async disconnect(): Promise<void> {
    await this.app.stop();
  }

  async reply(context: MessageContext, message: string): Promise<string> {
    const { say } = context.raw as { say: SayFn };

    // If this is a slash command, we don't have a message TS to thread on
    const isSlashCommand = !!(context.raw as any).command;

    // Use centralized logic
    const useThread = this.shouldReplyInThread(context, 'SLACK_FORCE_THREADING');

    // Determine thread_ts
    let threadTs: string | undefined;
    if (isSlashCommand) {
      threadTs = undefined; // Slash commands don't have a parent to thread on
    } else if (useThread) {
      // If continuing a thread, use existing ID. If forcing thread on new message, use message ID.
      threadTs = context.threadId || context.messageId;
    } else {
      threadTs = undefined; // Main channel message → reply in channel, not thread
    }

    const result = await say({
      text: message,
      thread_ts: threadTs
    });

    const ts = (result as any).ts;
    this.cacheReply(context.messageId, {
      channel: context.channelId,
      ts
    });
    return ts;
  }

  async editReply(context: MessageContext, _replyId: string, message: string): Promise<void> {
    const { client } = context.raw as { client: any };
    const cached = this.getCachedReply<{ channel: string; ts: string }>(context.messageId);

    if (cached) {
      await client.chat.update({
        channel: cached.channel,
        ts: cached.ts,
        text: message
      });
    }
  }

  async sendEmbed(channelId: string, embed: EmbedData): Promise<void> {
    const blocks = toSlackBlocks(embed);

    await this.app.client.chat.postMessage({
      channel: channelId,
      text: embed.title,
      blocks
    });
  }
}

