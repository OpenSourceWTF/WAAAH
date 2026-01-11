import * as readline from 'readline';
import {
  SERVER_URL,
  apiCall,
  handleError,
  parseMCPResponse,
  AgentInfo,
  formatAgentListItem,
  formatSingleAgentStatus,
  formatAgentStatus
} from './utils/index.js';
import { startEventListener, setEventListenerRl } from './utils/event-listener.js';

let activeRl: readline.Interface | null = null;

// Interactive mode
export async function interactiveMode() {
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
