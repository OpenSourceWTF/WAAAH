/**
 * Bot Core - Shared logic for all platforms
 */
import axios from 'axios';
import fs from 'fs';
import yaml from 'js-yaml';
import { PlatformAdapter, MessageContext, TaskResponse } from '../adapters/interface.js';

export interface BotCoreConfig {
  mcpServerUrl: string;
  apiKey?: string;
  configPath?: string;
  delegationChannelId?: string;
}

interface AgentsYaml {
  agents: Record<string, {
    displayName?: string;
    aliases?: string[];
  }>;
}

export class BotCore {
  private roleAliases: Record<string, string> = {};
  private adapter: PlatformAdapter;

  constructor(adapter: PlatformAdapter, private config: BotCoreConfig) {
    this.adapter = adapter;

    // Configure axios defaults
    if (config.apiKey) {
      axios.defaults.headers.common['X-API-Key'] = config.apiKey;
    }

    // Load role aliases
    if (config.configPath) {
      this.loadRoleAliases(config.configPath);
    }
  }

  private loadRoleAliases(configPath: string): void {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(content) as AgentsYaml;

      if (config?.agents) {
        for (const [roleName, agentConfig] of Object.entries(config.agents)) {
          if (agentConfig.displayName) {
            this.roleAliases[agentConfig.displayName.toLowerCase()] = roleName;
          }
          if (agentConfig.aliases) {
            for (const alias of agentConfig.aliases) {
              this.roleAliases[`@${alias.toLowerCase()}`] = roleName;
              this.roleAliases[alias.toLowerCase()] = roleName;
            }
          }
        }
      }
      console.log(`[Bot] Loaded ${Object.keys(this.roleAliases).length} role aliases`);
    } catch (e: any) {
      console.error(`[Bot] Failed to load config: ${e.message}`);
    }
  }

  async start(): Promise<void> {
    // Register message handler
    this.adapter.onMessage(this.handleMessage.bind(this));

    // Connect to platform
    await this.adapter.connect();
    console.log(`[Bot] Connected to ${this.adapter.platform}`);
    console.log(`[Bot] MCP Server: ${this.config.mcpServerUrl}`);

    // Start delegation polling if configured
    if (this.config.delegationChannelId) {
      this.startDelegationPolling();
    }
  }

  private async handleMessage(content: string, context: MessageContext): Promise<void> {
    // Handle admin commands
    if (content.startsWith('update')) {
      await this.handleUpdateCommand(content, context);
      return;
    }

    if (content.startsWith('clear')) {
      await this.handleClearCommand(context);
      return;
    }

    // Parse target role from message
    let targetRole: string | undefined;
    const words = content.split(/\s+/);

    if (words.length > 0) {
      const firstWord = words[0].toLowerCase();
      if (this.roleAliases[firstWord]) {
        targetRole = this.roleAliases[firstWord];
        content = words.slice(1).join(' ');
      }
    }

    // Detect priority
    const priority = content.toLowerCase().includes('urgent') ||
      content.toLowerCase().includes('critical')
      ? 'high' : 'normal';

    try {
      console.log(`[Bot] Enqueuing: "${content}" -> ${targetRole || 'any'}`);

      const response = await axios.post(`${this.config.mcpServerUrl}/admin/enqueue`, {
        prompt: content,
        role: targetRole,
        priority,
        context: {
          channelId: context.channelId,
          serverId: context.serverId,
          messageId: context.messageId,
          authorId: context.authorId,
          platform: context.platform
        }
      });

      const taskId = response.data.taskId;
      const roleHint = targetRole ? ` (routed to ${targetRole})` : '';
      await this.adapter.reply(context, `✅ Task enqueued!${roleHint} ID: \`${taskId}\`\n⏳ Waiting for agent...`);

      // Poll for response
      this.pollForResponse(taskId, context);

    } catch (e: any) {
      console.error('[Bot] Enqueue error:', e.message);
      await this.adapter.reply(context, '❌ Failed to enqueue task. Check MCP Server status.');
    }
  }

  private async pollForResponse(taskId: string, context: MessageContext): Promise<void> {
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    const poll = setInterval(async () => {
      if (Date.now() - startTime > timeout) {
        clearInterval(poll);
        await this.adapter.editReply(context, '', `⌛ Task \`${taskId}\` timed out after 5 mins.`);
        return;
      }

      try {
        const resp = await axios.get(`${this.config.mcpServerUrl}/admin/tasks/${taskId}`);
        const task: TaskResponse = resp.data;

        if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status)) {
          clearInterval(poll);

          let message = '';
          if (task.status === 'COMPLETED') {
            const artifacts = task.response?.artifacts?.length
              ? `\n**Artifacts:** ${task.response.artifacts.join(', ')}`
              : '';
            message = `✅ **Completed!** (ID: \`${taskId}\`)\n\n${task.response?.message}${artifacts}`;
          } else if (task.status === 'FAILED') {
            message = `❌ **Failed** (ID: \`${taskId}\`)\n\n${task.response?.message || 'Unknown error'}`;
          } else if (task.status === 'BLOCKED') {
            message = `⚠️ **Blocked** (ID: \`${taskId}\`)\n\n${task.response?.message}`;
          }

          await this.adapter.editReply(context, '', message);
        }
      } catch (e: any) {
        console.error(`[Bot] Poll error for ${taskId}:`, e.message);
      }
    }, 5000);
  }

  private async handleUpdateCommand(content: string, context: MessageContext): Promise<void> {
    const args = content.split(' ');
    const target = args[1];

    if (!target) {
      await this.adapter.reply(context, '❌ Usage: `update <agentId|@Name> [name=NewName] [color=#HEX]`');
      return;
    }

    const updates: any = { agentId: target };
    for (const arg of args.slice(2)) {
      const [key, val] = arg.split('=');
      if (key === 'name') updates.displayName = val;
      if (key === 'color') updates.color = val;
    }

    try {
      await axios.post(`${this.config.mcpServerUrl}/mcp/tools/admin_update_agent`, updates);
      await this.adapter.reply(context, `✅ Updated agent ${target}`);
    } catch (e: any) {
      await this.adapter.reply(context, `❌ Update failed: ${e.response?.data?.error || e.message}`);
    }
  }

  private async handleClearCommand(context: MessageContext): Promise<void> {
    try {
      await axios.post(`${this.config.mcpServerUrl}/admin/queue/clear`);
      await this.adapter.reply(context, '✅ Queue cleared.');
    } catch {
      await this.adapter.reply(context, '❌ Failed to clear queue.');
    }
  }

  private startDelegationPolling(): void {
    const seenTaskIds = new Set<string>();

    setInterval(async () => {
      try {
        const resp = await axios.get(`${this.config.mcpServerUrl}/admin/tasks`);
        const tasks = resp.data as any[];

        for (const task of tasks) {
          if (task.context?.isDelegation && !seenTaskIds.has(task.id)) {
            seenTaskIds.add(task.id);

            await this.adapter.sendEmbed(this.config.delegationChannelId!, {
              title: '🔀 Agent Delegation',
              color: '#7289da',
              fields: [
                { name: 'From', value: `\`${task.from?.name || task.from?.id}\``, inline: true },
                { name: 'To', value: `\`${task.to?.agentId}\``, inline: true },
                { name: 'Task', value: task.prompt.length > 200 ? task.prompt.slice(0, 200) + '...' : task.prompt },
                { name: 'Task ID', value: `\`${task.id}\`` }
              ],
              timestamp: task.createdAt
            });

            console.log(`[Bot] Posted delegation: ${task.from?.name} -> ${task.to?.agentId}`);
          }
        }
      } catch {
        // Silently ignore
      }
    }, 5000);

    console.log(`[Bot] Delegation notifications enabled`);
  }
}
