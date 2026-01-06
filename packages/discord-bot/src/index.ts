import { Client, GatewayIntentBits, Message } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

dotenv.config();

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.resolve(__dirname, '../../../config/agents.yaml');

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

  // Check for @mention of the bot
  if (client.user && message.mentions.has(client.user)) {
    let content = message.content.replace(`<@${client.user.id}>`, '').trim();

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

