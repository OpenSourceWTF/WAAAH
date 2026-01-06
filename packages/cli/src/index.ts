#!/usr/bin/env node
import { Command } from 'commander';
import axios from 'axios';
import * as readline from 'readline';

const SERVER_URL = process.env.WAAAH_SERVER_URL || 'http://localhost:3000';

const program = new Command();

program
  .name('waaah')
  .description('WAAAH CLI - Interact with the agent orchestration system')
  .version('0.1.0');

async function checkServerConnection(): Promise<boolean> {
  try {
    await axios.get(`${SERVER_URL}/debug/state`, { timeout: 3000 });
    return true;
  } catch (e) {
    return false;
  }
}

async function ensureServerRunning() {
  const isRunning = await checkServerConnection();
  if (!isRunning) {
    console.error('❌ Cannot connect to WAAAH server at', SERVER_URL);
    console.error('   Hint: Start the server with `pnpm server` in another terminal.');
    process.exit(1);
  }
}

let activeRl: readline.Interface | null = null;

function logInjected(message: string) {
  if (activeRl) {
    // Clear current line to avoid prompt corruption
    process.stdout.write('\r\x1b[K');
    console.log(message);
    activeRl.prompt(true); // Redraw prompt
  } else {
    console.log(message);
  }
}

async function startEventListener() {
  while (true) {
    try {
      const response = await axios.get(`${SERVER_URL}/admin/events`, { timeout: 60000 });
      const data = response.data;

      if (data.status === 'TIMEOUT') continue;

      if (data.type === 'task_update') {
        const t = data.task;
        if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(t.status)) {
          const agentId = t.to.agentId || t.to.role || 'unknown';
          const icon = t.status === 'COMPLETED' ? '✅' : t.status === 'FAILED' ? '❌' : '⚠️';

          let msg = `\n${icon} [${agentId}] ${t.status}: ${t.response?.message || 'No message'}`;
          if (t.response?.artifacts?.length) {
            msg += `\n   Artifacts: ${t.response.artifacts.join(', ')}`;
          }
          logInjected(msg);
        } else if (t.status === 'ASSIGNED') {
          logInjected(`\n⏳ [${t.to.agentId || t.to.role}] Assigned task: ${t.id}`);
        }
      }
    } catch (e: any) {
      // Quietly retry on connection errors
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Send task to agent
program
  .command('send <target> <prompt...>')
  .description('Send a task to a specific agent or role')
  .option('-p, --priority <priority>', 'Task priority (normal|high|critical)', 'normal')
  .option('--wait', 'Wait for response (blocks until completion)', false)
  .action(async (target: string, promptParts: string[], options: { priority: string, wait: boolean }) => {
    const prompt = promptParts.join(' ');
    try {
      const response = await axios.post(`${SERVER_URL}/admin/enqueue`, {
        prompt,
        agentId: target,
        priority: options.priority
      });
      console.log(`✅ Task enqueued: ${response.data.taskId}`);
      if (options.wait) {
        await pollTaskResponse(response.data.taskId);
      }
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

// List registered agents
program
  .command('list-agents')
  .description('List all registered agents')
  .action(async () => {
    try {
      const response = await axios.post(`${SERVER_URL}/mcp/tools/list_agents`, {});
      const content = response.data.content?.[0]?.text;
      if (content) {
        const agents = JSON.parse(content);
        agents.forEach((agent: any) => console.log(`  - ${agent.displayName} (${agent.id}) [${agent.role}]`));
      }
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

// Get agent status
program
  .command('status <agentId>')
  .description('Get status of a specific agent')
  .action(async (agentId: string) => {
    try {
      const response = await axios.post(`${SERVER_URL}/mcp/tools/get_agent_status`, { agentId });
      const content = response.data.content?.[0]?.text;
      if (content) {
        const status = JSON.parse(content);
        console.log(`Status: ${status.status}`);
      }
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

// Debug server state
program
  .command('debug')
  .description('Show server debug state')
  .action(async () => {
    try {
      const response = await axios.get(`${SERVER_URL}/debug/state`);
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
      console.error(`❌ Failed: ${error.message}`);
      process.exit(1);
    }
  });

async function pollTaskResponse(taskId: string) {
  const start = Date.now();
  const timeout = 60000;
  while (Date.now() - start < timeout) {
    try {
      const resp = await axios.get(`${SERVER_URL}/admin/tasks/${taskId}`);
      const task = resp.data;
      if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status)) {
        console.log(`\nResult for ${taskId}: ${task.status}`);
        console.log(`   ${task.response?.message}`);
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) { break; }
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

  // Start background listener
  startEventListener();

  activeRl.prompt();

  activeRl.on('line', async (line) => {
    const args = line.trim().split(/\s+/);
    const cmd = args[0]?.toLowerCase();

    try {
      if (cmd === 'exit' || cmd === 'quit') {
        console.log('Goodbye!');
        process.exit(0);
      } else if (cmd === 'list' || cmd === 'agents') {
        const response = await axios.post(`${SERVER_URL}/mcp/tools/list_agents`, {});
        const content = response.data.content?.[0]?.text;
        if (content) {
          const agents = JSON.parse(content);
          agents.forEach((agent: any) => console.log(`  ${agent.displayName} (${agent.id}) [${agent.role}]`));
        }
      } else if (cmd === 'send' && args.length >= 3) {
        const target = args[1];
        const prompt = args.slice(2).join(' ');
        const response = await axios.post(`${SERVER_URL}/admin/enqueue`, {
          prompt,
          agentId: target,
          priority: 'normal'
        });
        console.log(`✅ Task enqueued: ${response.data.taskId}`);
        // No blocking here!
      } else if (cmd === 'status' && args[1]) {
        const response = await axios.post(`${SERVER_URL}/mcp/tools/get_agent_status`, { agentId: args[1] });
        const content = response.data.content?.[0]?.text;
        if (content) {
          const status = JSON.parse(content);
          console.log(`Status: ${status.status}`);
        }
      } else if (cmd === 'debug') {
        const response = await axios.get(`${SERVER_URL}/debug/state`);
        console.log(JSON.stringify(response.data, null, 2));
      } else if (cmd === 'help') {
        console.log('Commands: send <agent> <prompt>, list, status <agent>, debug, exit');
      } else if (cmd) {
        console.log('Unknown command. Type "help" for available commands.');
      }
    } catch (error: any) {
      console.error(`❌ ${error.message}`);
    }

    activeRl?.prompt();
  });
}

if (process.argv.length <= 2) {
  ensureServerRunning().then(() => interactiveMode());
} else {
  ensureServerRunning().then(() => program.parse());
}
