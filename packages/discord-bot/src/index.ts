import { Client, GatewayIntentBits, Message, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

dotenv.config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const WAAAH_API_KEY = process.env.WAAAH_API_KEY;
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.resolve(__dirname, '../../../config/agents.yaml');

// Configure axios to send API key with all requests
if (WAAAH_API_KEY) {
  axios.defaults.headers.common['X-API-Key'] = WAAAH_API_KEY;
}

// Approved users (comma-separated Discord user IDs)
// Leave empty or unset to allow all users
const APPROVED_USERS: Set<string> = new Set(
  (process.env.APPROVED_USERS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0)
);

// Channel for delegation notifications (optional)
const DELEGATION_CHANNEL_ID = process.env.DELEGATION_CHANNEL_ID;

if (!DISCORD_TOKEN) {
  console.error('[Bot] Missing DISCORD_TOKEN in env');
  process.exit(1);
}

// Load role aliases from config
interface AgentConfig {
  displayName?: string;
  aliases?: string[];
  canDelegateTo?: string[];
  reportsTo?: string[];
}

interface AgentsYaml {
  agents: Record<string, AgentConfig>;
}

function loadRoleAliases(): Record<string, string> {
  const aliases: Record<string, string> = {};

  try {
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    const config = yaml.load(configContent) as AgentsYaml;

    if (config?.agents) {
      for (const [roleName, agentConfig] of Object.entries(config.agents)) {
        // Add displayName as alias (e.g., "@PM" -> "project-manager")
        if (agentConfig.displayName) {
          aliases[agentConfig.displayName.toLowerCase()] = roleName;
        }

        // Add all custom aliases
        if (agentConfig.aliases) {
          for (const alias of agentConfig.aliases) {
            aliases[`@${alias.toLowerCase()}`] = roleName;
            aliases[alias.toLowerCase()] = roleName; // Without @
          }
        }
      }
    }

    console.log(`[Bot] Loaded ${Object.keys(aliases).length} role aliases from config`);
  } catch (error: any) {
    console.error(`[Bot] Failed to load config from ${CONFIG_PATH}:`, error.message);
    console.error('[Bot] Using empty role aliases');
  }

  return aliases;
}

const roleAliases = loadRoleAliases();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);
  console.log(`[Bot] Connected to MCP Server: ${MCP_SERVER_URL}`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  // Filter: only approved users (if list is configured)
  if (APPROVED_USERS.size > 0 && !APPROVED_USERS.has(message.author.id)) {
    return; // Silently ignore unapproved users
  }

  // Check for @mention of the bot
  if (client.user && message.mentions.has(client.user)) {
    let content = message.content.replace(`<@${client.user.id}>`, '').trim();

    // Handle commands
    if (content.startsWith('update')) {
      // Format: !waaah update <target> [name=<name>] [color=<color>]
      const args = content.split(' ');
      const target = args[1];
      if (!target) {
        await message.reply('❌ Usage: `!waaah update <agentId|@Name> [name=NewName] [color=#HEX]`');
        return;
      }

      const updates: any = { agentId: target };
      for (const arg of args.slice(2)) {
        const [key, val] = arg.split('=');
        if (key === 'name') updates.displayName = val;
        if (key === 'color') updates.color = val;
      }

      try {
        await axios.post(`${MCP_SERVER_URL}/mcp/tools/admin_update_agent`, updates);
        await message.reply(`✅ Updated agent ${target}`);
      } catch (e: any) {
        await message.reply(`❌ Update failed: ${e.response?.data?.error || e.message}`);
      }
      return;
    }

    if (content.startsWith('clear')) {
      try {
        await axios.post(`${MCP_SERVER_URL}/admin/queue/clear`);
        await message.reply('✅ Queue cleared.');
      } catch (e: any) {
        await message.reply('❌ Failed to clear queue.');
      }
      return;
    }

    // Parse for role mention (e.g., "@FullStack implement login")
    let targetRole: string | undefined;
    const words = content.split(/\s+/);

    if (words.length > 0) {
      const firstWord = words[0].toLowerCase();
      if (roleAliases[firstWord]) {
        targetRole = roleAliases[firstWord];
        content = words.slice(1).join(' ');
      }
    }

    // Detect priority based on keywords
    let priority = 'normal';
    if (content.toLowerCase().includes('urgent') || content.toLowerCase().includes('critical')) {
      priority = 'high';
    }

    try {
      console.log(`[Bot] Enqueuing task: "${content}" -> ${targetRole || 'any'} from ${message.author.tag}`);
      const response = await axios.post(`${MCP_SERVER_URL}/admin/enqueue`, {
        prompt: content,
        role: targetRole,
        priority,
        context: {
          channelId: message.channelId,
          guildId: message.guildId,
          messageId: message.id,
          authorId: message.author.id
        }
      });

      const taskId = response.data.taskId;
      const roleHint = targetRole ? ` (routed to ${targetRole})` : '';
      const reply = await message.reply(`✅ Task enqueued!${roleHint} ID: \`${taskId}\`\n⏳ Waiting for agent...`);

      // Start polling for response
      const startTime = Date.now();
      const timeout = 5 * 60 * 1000; // 5 minutes for Discord bot

      const poll = setInterval(async () => {
        if (Date.now() - startTime > timeout) {
          clearInterval(poll);
          await reply.edit(`✅ Task enqueued!${roleHint} ID: \`${taskId}\`\n⌛ Task timed out after 5 mins.`);
          return;
        }

        try {
          const taskResp = await axios.get(`${MCP_SERVER_URL}/admin/tasks/${taskId}`);
          const task = taskResp.data;

          if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status)) {
            clearInterval(poll);

            if (task.status === 'COMPLETED') {
              let artifactStr = '';
              if (task.response?.artifacts?.length) {
                artifactStr = '\n**Artifacts:** ' + task.response.artifacts.join(', ');
              }
              await reply.edit(`✅ **Task Completed!** (ID: \`${taskId}\`)\n\n${task.response?.message}${artifactStr}`);
            } else if (task.status === 'FAILED') {
              await reply.edit(`❌ **Task Failed** (ID: \`${taskId}\`)\n\n${task.response?.message || 'Unknown error'}`);
            } else if (task.status === 'BLOCKED') {
              await reply.edit(`⚠️ **Task Blocked** (ID: \`${taskId}\`)\n\nReason: ${task.response?.message || task.response?.blockedReason || 'No details'}`);
            }
          }
        } catch (e: any) {
          console.error(`[Bot] Error polling task ${taskId}:`, e.message);
        }
      }, 5000);

    } catch (error: any) {
      console.error('[Bot] Error enqueuing task:', error.message);
      await message.reply('❌ Failed to enqueue task. Check MCP Server status.');
    }
  }
});

client.login(DISCORD_TOKEN);

// === DELEGATION NOTIFICATIONS ===
// Poll for delegation events and post to designated channel
if (DELEGATION_CHANNEL_ID) {
  const seenTaskIds = new Set<string>();

  setInterval(async () => {
    try {
      const resp = await axios.get(`${MCP_SERVER_URL}/admin/tasks`);
      const tasks = resp.data as any[];

      for (const task of tasks) {
        // Only process new delegations
        if (task.context?.isDelegation && !seenTaskIds.has(task.id)) {
          seenTaskIds.add(task.id);

          const channel = await client.channels.fetch(DELEGATION_CHANNEL_ID);
          if (channel?.isTextBased()) {
            const fromAgentName = task.from?.name || task.from?.id || 'Unknown';
            const fromAgentId = task.from?.id;
            const toAgentId = task.to?.agentId || 'Unknown';

            // Try to find color for source agent
            let color = '#7289da'; // Default Discord Blurple
            try {
              // Fetch agents to find color (naive optimization: fetch all every time or cache?)
              // For 5s poll, fetching all is fine for small agent count.
              const agentsResp = await axios.get(`${MCP_SERVER_URL}/debug/state`);
              const agents = agentsResp.data.agents as any[];
              const agent = agents.find(a => a.id === fromAgentId || a.displayName === fromAgentName);
              if (agent?.color) color = agent.color;
            } catch (e) { }

            const embed = new EmbedBuilder()
              .setColor(color as any)
              .setTitle('🔀 Agent Delegation')
              .addFields(
                { name: 'From', value: `\`${fromAgentName}\``, inline: true },
                { name: 'To', value: `\`${toAgentId}\``, inline: true },
                { name: 'Task', value: task.prompt.length > 200 ? task.prompt.substring(0, 200) + '...' : task.prompt },
                { name: 'Task ID', value: `\`${task.id}\`` }
              )
              .setTimestamp(task.createdAt);

            await (channel as any).send({ embeds: [embed] });
            console.log(`[Bot] Posted delegation notification: ${fromAgentName} -> ${toAgentId}`);
          }
        }
      }
    } catch (e: any) {
      // Silently ignore - server might be down
    }
  }, 5000); // Check every 5 seconds

  console.log(`[Bot] Delegation notifications enabled, posting to channel ${DELEGATION_CHANNEL_ID}`);
}

