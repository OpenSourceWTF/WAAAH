/**
 * Discord Platform Adapter
 */
import { Client, GatewayIntentBits, Message, EmbedBuilder, TextChannel } from 'discord.js';
import { PlatformAdapter, MessageContext, MessageHandler, EmbedData } from './interface.js';

export class DiscordAdapter implements PlatformAdapter {
  readonly platform = 'discord' as const;
  private client: Client;
  private messageHandler?: MessageHandler;
  private replyCache = new Map<string, Message>();

  constructor(private token: string, private approvedUsers: Set<string>) {
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
        console.log(`[Discord] Logged in as ${this.client.user?.tag}`);
        resolve();
      });

      this.client.on('messageCreate', async (message: Message) => {
        if (message.author.bot) return;

        // Filter approved users
        if (this.approvedUsers.size > 0 && !this.approvedUsers.has(message.author.id)) {
          return;
        }

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
          raw: message
        };

        if (this.messageHandler) {
          await this.messageHandler(content, context);
        }
      });

      this.client.login(this.token).catch(reject);
    });
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
  }

  async reply(context: MessageContext, message: string): Promise<string> {
    const original = context.raw as Message;
    const reply = await original.reply(message);
    this.replyCache.set(`${context.messageId}:reply`, reply);
    return reply.id;
  }

  async editReply(context: MessageContext, replyId: string, message: string): Promise<void> {
    const reply = this.replyCache.get(`${context.messageId}:reply`);
    if (reply) {
      await reply.edit(message);
    }
  }

  async sendEmbed(channelId: string, embed: EmbedData): Promise<void> {
    const channel = await this.client.channels.fetch(channelId) as TextChannel;
    if (!channel?.isTextBased()) return;

    const discordEmbed = new EmbedBuilder()
      .setTitle(embed.title)
      .setColor((embed.color || '#7289da') as any);

    for (const field of embed.fields) {
      discordEmbed.addFields({ name: field.name, value: field.value, inline: field.inline });
    }

    if (embed.timestamp) {
      discordEmbed.setTimestamp(embed.timestamp);
    }

    await channel.send({ embeds: [discordEmbed] });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }
}
