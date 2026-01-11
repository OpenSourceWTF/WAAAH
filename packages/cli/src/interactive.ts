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

type CommandHandler = (args: string[]) => Promise<void>;

const sendCommand: CommandHandler = async (args) => {
  const [, target, ...promptParts] = args;
  const prompt = promptParts.join(' ');
  const response = await apiCall<{ taskId: string }>('post', '/admin/enqueue', { prompt, agentId: target });
  console.log(`✅ Task enqueued: ${response.taskId}`);
};

const listCommand: CommandHandler = async () => {
  const response = await apiCall<any>('post', '/mcp/tools/list_agents', {});
  const agents = parseMCPResponse<AgentInfo[]>(response);
  agents?.forEach(agent => console.log(formatAgentListItem(agent)));
};

const statusCommand: CommandHandler = async (args) => {
  const agentId = args[1];
  const result = agentId
    ? await apiCall<any>('post', '/mcp/tools/get_agent_status', { agentId })
    : null;

  const parsed = agentId ? parseMCPResponse<AgentInfo>(result) : null;
  parsed && console.log(formatSingleAgentStatus(parsed));

  !agentId && await showAllAgentStatus();
};

const showAllAgentStatus = async () => {
  const agents = await apiCall<AgentInfo[]>('get', '/admin/agents/status');
  agents.length === 0
    ? console.log('No agents registered.')
    : (console.log('Agent Status:'), agents.forEach(a => console.log(`  ${formatAgentStatus(a)}`)));
};

const debugCommand: CommandHandler = async () => {
  const data = await apiCall<any>('get', '/debug/state');
  console.log(JSON.stringify(data, null, 2));
};

const helpCommand: CommandHandler = async () => {
  console.log('Commands: send <agent> <prompt>, list, status [agent], debug, exit');
};

const commands: Record<string, { handler: CommandHandler; minArgs?: number }> = {
  send: { handler: sendCommand, minArgs: 3 },
  list: { handler: listCommand },
  status: { handler: statusCommand },
  debug: { handler: debugCommand },
  help: { handler: helpCommand },
  exit: { handler: async () => process.exit(0) },
  quit: { handler: async () => process.exit(0) }
};

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
      const command = cmd ? commands[cmd] : null;
      command?.minArgs && args.length < command.minArgs
        ? console.log(`Usage: ${cmd} requires at least ${command.minArgs - 1} arguments`)
        : command
          ? await command.handler(args)
          : cmd && console.log('Unknown command. Type "help" for available commands.');
    } catch (error) {
      handleError(error, false);
    }

    activeRl?.prompt();
  });
}
