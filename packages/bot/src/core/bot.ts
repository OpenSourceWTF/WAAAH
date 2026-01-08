/**
 * Bot Core - Shared logic for all platforms
 */
import axios from 'axios';
import { PlatformAdapter, MessageContext, TaskResponse } from '../adapters/interface.js';

export interface BotCoreConfig {
  mcpServerUrl: string;
  apiKey?: string;
  delegationChannelId?: string;
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
  }

  private async loadDynamicAliases(): Promise<void> {
    try {
      const resp = await axios.get(`${this.config.mcpServerUrl}/admin/agents/status`);
      if (Array.isArray(resp.data)) {
        for (const agent of resp.data) {
          if (agent.displayName && agent.role) {
            const displayLower = agent.displayName.toLowerCase();
            this.roleAliases[displayLower] = agent.role;
            // Also map without @ prefix
            if (displayLower.startsWith('@')) {
              this.roleAliases[displayLower.slice(1)] = agent.role;
            }
          }
        }
        console.log(`[Bot] Loaded ${Object.keys(this.roleAliases).length} dynamic role aliases from MCP`);
      }
    } catch (e: any) {
      console.warn(`[Bot] Failed to load dynamic aliases: ${e.message}`);
    }
  }

  async start(): Promise<void> {
    // Register message handler
    this.adapter.onMessage(this.handleMessage.bind(this));

    // Connect to platform
    await this.loadDynamicAliases();
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

    if (command.startsWith('answer')) {
      await this.handleAnswerCommand(normalized, context);
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
      const roleDisplay = targetRole ? `**@${targetRole.replace(/-/g, '')}**` : '';
      await this.adapter.reply(context, `📋 **Task Scheduled** \`${taskId}\`${roleDisplay ? ` → ${roleDisplay}` : ''}`);

      // Poll for response (includes assignment updates)
      this.pollForResponse(taskId, context, targetRole);

    } catch (e: any) {
      console.error('[Bot] Enqueue error:', e.message);
      await this.adapter.reply(context, '❌ Failed to enqueue task. Check MCP Server status.');
    }
  }

  private async pollForResponse(taskId: string, context: MessageContext, targetRole?: string): Promise<void> {
    const startTime = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes
    let wasAssigned = false;
    let assignedAt = 0;
    let assignedAgent = '';

    const formatDuration = (ms: number): string => {
      const seconds = (ms / 1000).toFixed(1);
      return `${seconds}s`;
    };

    const poll = setInterval(async () => {
      if (Date.now() - startTime > timeout) {
        clearInterval(poll);
        await this.adapter.editReply(context, '', `⌛ **Task Timed Out** \`${taskId}\``);
        return;
      }

      try {
        const resp = await axios.get(`${this.config.mcpServerUrl}/admin/tasks/${taskId}`);
        const task: TaskResponse = resp.data;

        // Update message when assigned (once)
        if (task.status === 'ASSIGNED' && !wasAssigned) {
          wasAssigned = true;
          assignedAt = Date.now();
          assignedAgent = task.assignedTo || 'agent';
          await this.adapter.editReply(context, '', `👤 **Task Assigned** \`${taskId}\` to @${assignedAgent}`);
        }

        // Final states
        if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status)) {
          clearInterval(poll);

          const duration = assignedAt ? formatDuration(Date.now() - assignedAt) : '';
          const agent = assignedAgent || task.assignedTo || 'agent';

          let statusWord = 'Completed';
          let emoji = '✅';
          if (task.status === 'FAILED') { statusWord = 'Failed'; emoji = '❌'; }
          if (task.status === 'BLOCKED') { statusWord = 'Blocked'; emoji = '⚠️'; }

          const message = `${emoji} **Task ${statusWord}** \`${taskId}\` by @${agent}${duration ? ` in ${duration}` : ''}`;
          await this.adapter.editReply(context, '', message);
        }
      } catch (e: any) {
        console.error(`[Bot] Poll error for ${taskId}:`, e.message);
      }
    }, 3000);
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

  private async handleAnswerCommand(content: string, context: MessageContext): Promise<void> {
    // Format: answer <taskId> <answer text>
    const args = content.split(' ');
    const taskId = args[1];
    const answer = args.slice(2).join(' ');

    if (!taskId || !answer) {
      await this.adapter.reply(context, '❌ Usage: `answer <taskId> <answer text>`');
      return;
    }

    try {
      await axios.post(`${this.config.mcpServerUrl}/mcp/tools/answer_task`, {
        taskId,
        answer
      });
      await this.adapter.reply(context, `✅ Answered task ${taskId}`);
    } catch (e: any) {
      await this.adapter.reply(context, `❌ Failed to answer task: ${e.response?.data?.error || e.message}`);
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

  private async connectDelegationStream(retryCount = 0): Promise<void> {
    const connectionStart = Date.now();

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
              const data = JSON.parse(event.slice(6));
              const { type, payload } = data;

              if (type === 'delegation' || (!type && payload?.from)) { // Handle legacy format if needed
                const task = payload || data;
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
              }
              else if (type === 'completion') {
                const task = payload;
                const isSuccess = task.status === 'COMPLETED';
                const color = isSuccess ? '#43b581' : (task.status === 'BLOCKED' ? '#faa61a' : '#f04747');
                const emoji = isSuccess ? '✅' : (task.status === 'BLOCKED' ? '⚠️' : '❌');

                // Truncate response message if too long
                let responseMsg = task.response?.message || 'No response message';
                if (responseMsg.length > 500) responseMsg = responseMsg.slice(0, 497) + '...';

                // Calculate duration
                const duration = task.completedAt && task.createdAt
                  ? ((task.completedAt - task.createdAt) / 1000).toFixed(1) + 's'
                  : 'N/A';

                await this.adapter.sendEmbed(this.config.delegationChannelId!, {
                  title: `${emoji} Task ${task.status}`,
                  color,
                  fields: [
                    { name: 'Task ID', value: `\`${task.id}\``, inline: true },
                    { name: 'Agent', value: `\`${task.assignedTo || task.to?.agentId || task.to?.role || 'unknown'}\``, inline: true },
                    { name: 'Duration', value: duration, inline: true },
                    { name: 'Result', value: responseMsg }
                  ],
                  timestamp: task.completedAt || Date.now()
                });
                console.log(`[Bot] Posted completion: ${task.id} (${task.status}) in ${duration}`);
              }
            } catch (parseErr) {
              console.error('[Bot] Failed to parse SSE event:', parseErr);
            }
          }
        }
      });

      response.data.on('error', (err: Error) => {
        console.error('[Bot] SSE stream error:', err.message);
        this.scheduleReconnect(connectionStart, retryCount);
      });

      response.data.on('end', () => {
        console.log('[Bot] SSE stream ended.');
        this.scheduleReconnect(connectionStart, retryCount);
      });

      console.log(`[Bot] Delegation SSE stream connected`);

    } catch (err: any) {
      console.error('[Bot] Failed to connect delegation stream:', err.message);
      this.scheduleReconnect(connectionStart, retryCount);
    }
  }

  private scheduleReconnect(lastConnectTime: number, currentRetries: number): void {
    // If we were connected for more than 30s, reset retries
    const uptime = Date.now() - lastConnectTime;
    const nextRetries = uptime > 30000 ? 0 : currentRetries + 1;

    // Exponential backoff: 1s, 1.5s, 2.25s... cap at 30s
    const delay = Math.min(1000 * Math.pow(1.5, nextRetries), 30000);

    console.log(`[Bot] Reconnecting SSE in ${Math.round(delay)}ms (Attempt ${nextRetries + 1})...`);
    setTimeout(() => this.connectDelegationStream(nextRetries), delay);
  }
}
