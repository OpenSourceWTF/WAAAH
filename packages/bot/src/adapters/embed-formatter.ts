/**
 * Embed Formatter
 * 
 * Utilities to convert unified EmbedData into platform-specific formats.
 */
import { EmbedBuilder } from 'discord.js';
import { EmbedData } from './interface.js';

/**
 * Convert to Discord EmbedBuilder
 */
export function toDiscordEmbed(embed: EmbedData): EmbedBuilder {
  const discordEmbed = new EmbedBuilder()
    .setTitle(embed.title)
    .setColor((embed.color || '#7289da') as any);

  for (const field of embed.fields) {
    discordEmbed.addFields({
      name: field.name,
      value: field.value,
      inline: field.inline
    });
  }

  if (embed.timestamp) {
    discordEmbed.setTimestamp(embed.timestamp);
  }

  return discordEmbed;
}

/**
 * Convert to Slack Blocks
 */
export function toSlackBlocks(embed: EmbedData): any[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: embed.title, emoji: true }
    },
    {
      type: 'section',
      fields: embed.fields.map(f => ({
        type: 'mrkdwn',
        text: `*${f.name}*\n${f.value}`
      }))
    },
    // Optional footer for timestamp if needed (Slack blocks are limited)
    ...(embed.timestamp ? [{
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Posted: <!date^${Math.floor(embed.timestamp / 1000)}^{date_short_pretty} at {time}|${new Date(embed.timestamp).toLocaleString()}>`
      }]
    }] : [])
  ];
}
