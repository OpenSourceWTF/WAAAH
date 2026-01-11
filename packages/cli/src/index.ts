#!/usr/bin/env node
import { Command } from 'commander';
import * as readline from 'readline';
import {
  SERVER_URL,
  apiCall,
  parseMCPResponse,
  handleError,
  ensureServerRunning
} from './utils/index.js';
import {
  AgentInfo,
  formatAgentListItem,
  formatAgentStatus,
  formatSingleAgentStatus
} from './utils/index.js';
import { startEventListener, setEventListenerRl } from './utils/event-listener.js';
import { restartCommand } from './commands/restart.js';
import { assignCommand } from './commands/assign.js';
import { initCommand } from './commands/init.js';
import { taskCommand } from './commands/task.js';
import { agentCommand } from './commands/agent.js';
import { syncSkillsCommand } from './commands/sync-skills.js';

const program = new Command();

program
  .name('waaah')
  .description('WAAAH MCP CLI')
  .version('0.0.1');

program.addCommand(restartCommand);
program.addCommand(assignCommand);
program.addCommand(initCommand);
program.addCommand(taskCommand);
program.addCommand(agentCommand);
program.addCommand(syncSkillsCommand);

let activeRl: readline.Interface | null = null;

// Send task to agent
program
  .command('send <target> <prompt...>')
  .description('Send a task to a specific agent or role')
  .option('-p, --priority <priority>', 'Task priority (normal|high|critical)', 'normal')
  .option('--wait', 'Wait for response (blocks until completion)', false)
  .action(async (target: string, promptParts: string[], options: { priority: string, wait: boolean }) => {
    const prompt = promptParts.join(' ');
    try {
      const response = await apiCall<{ taskId: string }>('post', '/admin/enqueue', {
        prompt,
        agentId: target,
        priority: options.priority
      });
      console.log(`✅ Task enqueued: ${response.taskId}`);
      if (options.wait) {
        await pollTaskResponse(response.taskId);
      }
    } catch (error) {
      handleError(error);
    }
  });

// Answer a blocked task
program
  .command('answer <taskId> <answer...>')
  .description('Provide an answer to a blocked task')
  .action(async (taskId: string, answerParts: string[]) => {
    const answer = answerParts.join(' ');
    try {
      const response = await apiCall<any>('post', '/mcp/tools/answer_task', {
        taskId,
        answer
      });
      // The tool returns content array
      const text = response.content?.[0]?.text || 'Answer recorded.';
      console.log(`✅ ${text}`);
    } catch (error) {
      handleError(error);
    }
  });

// List registered agents
program
  .command('list-agents')
  .description('List all registered agents')
  .action(async () => {
    try {
      const response = await apiCall<any>('post', '/mcp/tools/list_agents', {});
      const agents = parseMCPResponse<AgentInfo[]>(response);
      if (agents) {
        agents.forEach(agent => console.log(formatAgentListItem(agent)));
      }
    } catch (error) {
      handleError(error);
    }
  });

// Get agent status
program
  .command('status [agentId]')
  .description('Get status of agents (all if no agentId provided)')
  .action(async (agentId?: string) => {
    try {
      if (agentId) {
        const response = await apiCall<any>('post', '/mcp/tools/get_agent_status', { agentId });
        const status = parseMCPResponse<AgentInfo>(response);
        if (status) {
          console.log(formatSingleAgentStatus(status));
        }
      } else {
        const agents = await apiCall<AgentInfo[]>('get', '/admin/agents/status');
        if (agents.length === 0) {
          console.log('No agents registered.');
        } else {
          console.log('Agent Status:');
          agents.forEach(a => console.log(`  ${formatAgentStatus(a)}`));
        }
      }
    } catch (error) {
      handleError(error);
    }
  });

// Debug server state
program
  .command('debug')
  .description('Show server debug state')
  .action(async () => {
    try {
      const data = await apiCall<any>('get', '/debug/state');
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });

async function pollTaskResponse(taskId: string) {
  const start = Date.now();
  const timeout = 60000;
  while (Date.now() - start < timeout) {
    try {
      const task = await apiCall<any>('get', `/admin/tasks/${taskId}`);
      if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status)) {
        console.log(`\nResult for ${taskId}: ${task.status}`);
        console.log(`   ${task.response?.message}`);
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch { break; }
  }
}

// Interactive mode
async function interactiveMode() {
  console.log('🚀 WAAAH Interactive CLI (Asynchronous)');
  console.log(`   Server: ${SERVER_URL}`);
  console.log('   Commands: send <agent> <prompt>, list, status <agent>, debug, exit\n');

  activeRl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'waaah> '
  });

  setEventListenerRl(activeRl);
  startEventListener();
  activeRl.prompt();

  activeRl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const cmd = args[0]?.toLowerCase();

    try {
      if (cmd === 'exit' || cmd === 'quit') {
        process.exit(0);
      } else if (cmd === 'send') {
        if (args.length < 3) {
          console.log('Usage: send <agent> <prompt...>');
        } else {
          const target = args[1];
          const prompt = args.slice(2).join(' ');
          const response = await apiCall<{ taskId: string }>('post', '/admin/enqueue', {
            prompt,
            agentId: target
          });
          console.log(`✅ Task enqueued: ${response.taskId}`);
        }
      } else if (cmd === 'list') {
        const response = await apiCall<any>('post', '/mcp/tools/list_agents', {});
        const agents = parseMCPResponse<AgentInfo[]>(response);
        if (agents) {
          agents.forEach(agent => console.log(formatAgentListItem(agent)));
        }
      } else if (cmd === 'status') {
        const agentId = args[1];
        if (agentId) {
          const response = await apiCall<any>('post', '/mcp/tools/get_agent_status', { agentId });
          const status = parseMCPResponse<AgentInfo>(response);
          if (status) console.log(formatSingleAgentStatus(status));
        } else {
          const agents = await apiCall<AgentInfo[]>('get', '/admin/agents/status');
          if (agents.length === 0) {
            console.log('No agents registered.');
          } else {
            console.log('Agent Status:');
            agents.forEach(a => console.log(`  ${formatAgentStatus(a)}`));
          }
        }
      } else if (cmd === 'debug') {
        const data = await apiCall<any>('get', '/debug/state');
        console.log(JSON.stringify(data, null, 2));
      } else if (cmd === 'help') {
        console.log('Commands: send <agent> <prompt>, list, status [agent], debug, exit');
      } else if (cmd) {
        console.log('Unknown command. Type "help" for available commands.');
      }
    } catch (error) {
      handleError(error, false);
    }

    activeRl?.prompt();
  });
}

if (process.argv.length <= 2) {
  ensureServerRunning().then(() => interactiveMode());
} else {
  ensureServerRunning().then(() => program.parse());
}