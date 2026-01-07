/**
 * Discord Platform Adapter
 */
import { Client, GatewayIntentBits, Message, TextChannel } from 'discord.js';
import { BaseAdapter } from './base-adapter.js';
import { MessageContext, EmbedData } from './interface.js';
import { toDiscordEmbed } from './embed-formatter.js';

export class DiscordAdapter extends BaseAdapter {
  readonly platform = 'discord' as const;
  private client: Client;
  private token: string;

  constructor(token: string, approvedUsers: Set<string>) {
    super(approvedUsers);
    this.token = token;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.once('ready', () => {
        this.log(`Logged in as ${this.client.user?.tag}`);
        resolve();
      });

      this.client.on('messageCreate', async (message: Message) => {
        if (message.author.bot) return;

        // Only respond to bot mentions
        if (!this.client.user || !message.mentions.has(this.client.user)) {
          return;
        }

        const content = message.content
          .replace(`<@${this.client.user.id}>`, '')
          .trim();

        const context: MessageContext = {
          messageId: message.id,
          channelId: message.channelId,
          serverId: message.guildId ?? undefined,
          authorId: message.author.id,
          authorName: message.author.tag,
          platform: 'discord',
          raw: message,
          isThread: message.channel.isThread(),
          threadId: message.channel.isThread() ? message.channelId : undefined
        };

        await this.processMessage(content, context);
      });

      this.client.login(this.token).catch(reject);
    });
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
  }

  async reply(context: MessageContext, message: string): Promise<string> {
    const original = context.raw as Message;

    // Use centralized threading logic
    const useThread = this.shouldReplyInThread(context, 'DISCORD_FORCE_THREADING');

    let sentMessage: Message;

    if (useThread) {
      // If already in a thread, just reply.
      if (context.isThread) {
        sentMessage = await original.reply(message);
      } else {
        // We need to create a thread from the original message if possible
        try {
          const threadName = `Thread for ${context.authorName}`;
          // startThread is available on Message if the channel supports it
          const thread = await original.startThread({
            name: threadName.substring(0, 100), // Discord max length
            autoArchiveDuration: 60, // 1 hour
          });
          sentMessage = await thread.send(message);
        } catch (err) {
          this.error(`Failed to create thread: ${err}`);
          // Fallback to normal reply if threading fails
          sentMessage = await original.reply(message);
        }
      }
    } else {
      // Send directly to channel (no thread, no reference)
      // Cast to any because TS thinks some channel types don't have send (they do in this context)
      const channel = original.channel as any;
      if (channel.send) {
        sentMessage = await channel.send(message);
      } else {
        // Fallback to reply if send not available
        sentMessage = await original.reply(message);
      }
    }

    this.cacheReply(context.messageId, sentMessage);
    return sentMessage.id;
  }

  async editReply(context: MessageContext, replyId: string, message: string): Promise<void> {
    const reply = this.getCachedReply<Message>(context.messageId);
    if (reply) {
      await reply.edit(message);
    }
  }

  async sendEmbed(channelId: string, embed: EmbedData): Promise<void> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel;
    if (!channel?.isTextBased()) return;

    const discordEmbed = toDiscordEmbed(embed);
    await channel.send({ embeds: [discordEmbed] });
  }
}

