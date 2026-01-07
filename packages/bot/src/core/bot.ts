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
          // Add displayName as alias (e.g., @fullstack -> full-stack-engineer)
          if (agentConfig.displayName) {
            const displayLower = agentConfig.displayName.toLowerCase();
            this.roleAliases[displayLower] = roleName;
            // Also without @ prefix
            if (displayLower.startsWith('@')) {
              this.roleAliases[displayLower.slice(1)] = roleName;
            }
          }
          // Add configured aliases
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
    // Normalize content for command checking
    const normalized = content.trim();
    const command = normalized.toLowerCase();

    // Handle admin commands
    if (command.startsWith('update')) {
      await this.handleUpdateCommand(normalized, context);
      return;
    }

    if (command.startsWith('clear')) {
      await this.handleClearCommand(context);
      return;
    }

    if (command === 'status' || command.startsWith('status ')) {
      await this.handleStatusCommand(context);
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

    if (!targetRole) {
      await this.adapter.reply(context, '❌ **Error:** Please specify a target agent (e.g. `@FullStack`). Unassigned tasks are not supported.');
      return;
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

  private async handleStatusCommand(context: MessageContext): Promise<void> {
    const aliasCount = Object.keys(this.roleAliases).length;
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    let agentDetails = '';
    let totalRegistered = 0;
    let onlineCount = 0;

    try {
      // 1. Fetch all agents
      const resp = await axios.post(`${this.config.mcpServerUrl}/mcp/tools/list_agents`, {});
      const content = resp.data.content?.[0]?.text;

      if (content) {
        const agents = JSON.parse(content) as any[];
        totalRegistered = agents.length;

        // 2. Filter online (last 5 mins)
        const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
        const onlineAgents = agents.filter(a => a.lastSeen && a.lastSeen > fiveMinsAgo);
        onlineCount = onlineAgents.length;

        if (onlineAgents.length > 0) {
          agentDetails = '\n**Connected Agents:**\n' +
            onlineAgents.map(a => `- **${a.displayName}** (\`${a.id}\`) - ${a.role}`).join('\n');
        } else {
          agentDetails = '\n**Connected Agents:** None';
        }
      }
    } catch (e: any) {
      agentDetails = `\n**Agents:** Error fetching list (${e.message})`;
    }

    const details = [
      `**MCP Server:** ${this.config.mcpServerUrl}`,
      `**Uptime:** ${hours}h ${minutes}m`,
      `**Aliases Loaded:** ${aliasCount}`,
      `**Agents Registered:** ${totalRegistered}`,
      `**Agents Online:** ${onlineCount}`,
      agentDetails
    ].join('\n');

    await this.adapter.reply(context, `🤖 **WAAAH Bot Online**\n\n${details}`);
  }

  private startDelegationPolling(): void {
    console.log(`[Bot] Starting delegation SSE stream...`);

    // Use SSE stream for real-time delegation notifications
    this.connectDelegationStream();
  }

  private async connectDelegationStream(): Promise<void> {
    try {
      const response = await axios.get(
        `${this.config.mcpServerUrl}/admin/delegations/stream`,
        { responseType: 'stream', timeout: 0 }
      );

      let buffer = '';

      response.data.on('data', async (chunk: Buffer) => {
        buffer += chunk.toString();

        // Parse SSE events (data: {...}\n\n)
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete last chunk

        for (const event of events) {
          if (event.startsWith('data: ')) {
            try {
              const task = JSON.parse(event.slice(6));

              await this.adapter.sendEmbed(this.config.delegationChannelId!, {
                title: '🔀 Agent Delegation',
                color: '#7289da',
                fields: [
                  { name: 'From', value: `\`${task.from}\``, inline: true },
                  { name: 'To', value: `\`${task.to}\``, inline: true },
                  { name: 'Task', value: task.prompt },
                  { name: 'Task ID', value: `\`${task.taskId}\`` }
                ],
                timestamp: task.createdAt
              });

              console.log(`[Bot] Posted delegation: ${task.from} -> ${task.to}`);
            } catch (parseErr) {
              console.error('[Bot] Failed to parse delegation event:', parseErr);
            }
          }
        }
      });

      response.data.on('error', (err: Error) => {
        console.error('[Bot] SSE stream error:', err.message);
        // Reconnect after delay
        setTimeout(() => this.connectDelegationStream(), 5000);
      });

      response.data.on('end', () => {
        console.log('[Bot] SSE stream ended, reconnecting...');
        setTimeout(() => this.connectDelegationStream(), 1000);
      });

      console.log(`[Bot] Delegation SSE stream connected`);
    } catch (err: any) {
      console.error('[Bot] Failed to connect delegation stream:', err.message);
      // Retry connection after delay
      setTimeout(() => this.connectDelegationStream(), 5000);
    }
  }
}
