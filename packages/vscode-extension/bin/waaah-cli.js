#!/usr/bin/env node

/**
 * WAAAH CLI - Interactive terminal for Antigravity agents
 * 
 * Usage:
 *   waaah-cli                          # Start interactive mode
 *   waaah-cli chat                     # Start interactive mode
 *   waaah-cli submit "message"         # One-shot submit
 *   waaah-cli status                   # Check agent status
 */

const http = require('http');
const readline = require('readline');

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = '127.0.0.1';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m'
};

function request(method, path, port, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: DEFAULT_HOST,
      port: port,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function submitAndWait(message, port) {
  const response = await request('POST', '/submit', port, {
    message: message,
    waitForResponse: true,
    timeoutMs: 300000 // 5 min timeout for interactive
  });

  if (response.status === 200 && response.data.success) {
    return response.data;
  } else {
    throw new Error(response.data.error || 'Submit failed');
  }
}

async function getStatus(port) {
  const response = await request('GET', '/status', port);
  return response.data;
}

async function pollForResponse(taskId, port, timeoutMs = 120000) {
  const startTime = Date.now();
  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  while (Date.now() - startTime < timeoutMs) {
    process.stdout.write(`\r${colors.cyan}${spinner[i % spinner.length]} Waiting for response...${colors.reset}`);
    i++;

    try {
      const response = await request('GET', `/task/${taskId}`, port);
      if (response.data.status === 'completed') {
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
        return response.data.response;
      }
    } catch {
      // Continue polling
    }

    await new Promise(r => setTimeout(r, 500));
  }

  process.stdout.write('\r' + ' '.repeat(30) + '\r');
  return null;
}

async function interactiveMode(port) {
  console.log(`
${colors.bright}${colors.cyan}╔══════════════════════════════════════════╗
║     WAAAH - Antigravity Agent CLI        ║
╚══════════════════════════════════════════╝${colors.reset}
`);

  // Check connection
  try {
    const status = await getStatus(port);
    console.log(`${colors.green}✓ Connected to agent: ${colors.bright}${status.agent.id}${colors.reset}`);
    console.log(`${colors.dim}  Role: ${status.agent.role} | Port: ${status.agent.port}${colors.reset}`);
    console.log(`${colors.dim}  Workspace: ${status.agent.workspacePath}${colors.reset}`);
  } catch (err) {
    console.log(`${colors.red}✗ Cannot connect to agent on port ${port}${colors.reset}`);
    console.log(`${colors.dim}  Is the WAAAH extension running in Antigravity?${colors.reset}`);
    process.exit(1);
  }

  console.log(`
${colors.dim}Type your message and press Enter to send.
Commands: /status, /port <n>, /clear, /exit${colors.reset}
`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${colors.green}you ▶${colors.reset} `
  });

  let currentPort = port;

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // Handle commands
    if (input.startsWith('/')) {
      const [cmd, ...args] = input.slice(1).split(' ');

      switch (cmd) {
        case 'exit':
        case 'quit':
        case 'q':
          console.log(`${colors.dim}Goodbye!${colors.reset}`);
          process.exit(0);
          break;

        case 'status':
          try {
            const status = await getStatus(currentPort);
            console.log(`${colors.cyan}Agent: ${status.agent.id}`);
            console.log(`Role: ${status.agent.role}`);
            console.log(`Pending tasks: ${status.pendingTasks}${colors.reset}`);
          } catch (err) {
            console.log(`${colors.red}Error: ${err.message}${colors.reset}`);
          }
          break;

        case 'port':
          if (args[0]) {
            currentPort = parseInt(args[0], 10);
            console.log(`${colors.cyan}Switched to port ${currentPort}${colors.reset}`);
          } else {
            console.log(`${colors.cyan}Current port: ${currentPort}${colors.reset}`);
          }
          break;

        case 'clear':
          console.clear();
          break;

        case 'help':
          console.log(`
${colors.cyan}Commands:${colors.reset}
  /status      Show agent status
  /port <n>    Switch to different port
  /clear       Clear screen
  /exit        Exit CLI
`);
          break;

        default:
          console.log(`${colors.yellow}Unknown command: /${cmd}${colors.reset}`);
      }

      rl.prompt();
      return;
    }

    // Send message to agent
    try {
      console.log(`${colors.dim}Sending to agent...${colors.reset}`);

      const result = await submitAndWait(input, currentPort);

      if (result.response) {
        console.log(`\n${colors.magenta}agent ◀${colors.reset}`);
        console.log(result.response);
        console.log();
      } else {
        // Response not ready yet, poll for it
        console.log(`${colors.dim}Task ${result.taskId} submitted. Waiting...${colors.reset}`);
        const response = await pollForResponse(result.taskId, currentPort);

        if (response) {
          console.log(`\n${colors.magenta}agent ◀${colors.reset}`);
          console.log(response);
          console.log();
        } else {
          console.log(`${colors.yellow}(No response yet - task may still be processing)${colors.reset}`);
          console.log(`${colors.dim}Task ID: ${result.taskId}${colors.reset}`);
        }
      }
    } catch (err) {
      console.log(`${colors.red}Error: ${err.message}${colors.reset}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${colors.dim}Goodbye!${colors.reset}`);
    process.exit(0);
  });
}

async function oneShot(message, options = {}) {
  const port = options.port || DEFAULT_PORT;
  console.log(`${colors.dim}Sending to agent on port ${port}...${colors.reset}`);

  try {
    const result = await submitAndWait(message, port);

    if (result.response) {
      console.log(`\n${colors.green}✓ Response:${colors.reset}`);
      console.log(result.response);
    } else {
      console.log(`${colors.green}✓ Submitted as task: ${result.taskId}${colors.reset}`);
      console.log(`${colors.dim}Waiting for response...${colors.reset}`);

      const response = await pollForResponse(result.taskId, port);
      if (response) {
        console.log(`\n${colors.green}Response:${colors.reset}`);
        console.log(response);
      } else {
        console.log(`${colors.yellow}Timeout. Check task: waaah-cli task ${result.taskId}${colors.reset}`);
      }
    }
  } catch (err) {
    console.error(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

async function showStatus(options = {}) {
  const port = options.port || DEFAULT_PORT;

  try {
    const status = await getStatus(port);
    console.log(`${colors.bright}WAAAH Agent Status${colors.reset}`);
    console.log('═'.repeat(30));
    console.log(`Status:    ${colors.green}${status.status}${colors.reset}`);
    console.log(`Agent ID:  ${colors.cyan}${status.agent.id}${colors.reset}`);
    console.log(`Role:      ${status.agent.role}`);
    console.log(`Port:      ${status.agent.port}`);
    console.log(`Workspace: ${status.agent.workspacePath}`);
    console.log(`Tasks:     ${status.pendingTasks || 0} pending`);
  } catch (err) {
    console.error(`${colors.red}✗ Connection failed: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

async function discoverAgents(startPort = 9876, endPort = 9885) {
  console.log(`${colors.dim}Scanning ports ${startPort}-${endPort}...${colors.reset}`);
  const agents = [];

  for (let port = startPort; port <= endPort; port++) {
    try {
      const response = await request('GET', '/health', port);
      if (response.status === 200 && response.data.ok) {
        agents.push({ port, agentId: response.data.agentId });
        process.stdout.write(`${colors.green}.${colors.reset}`);
      } else {
        process.stdout.write(`${colors.dim}.${colors.reset}`);
      }
    } catch {
      process.stdout.write(`${colors.dim}.${colors.reset}`);
    }
  }

  console.log();

  if (agents.length === 0) {
    console.log(`${colors.yellow}No agents found${colors.reset}`);
  } else {
    console.log(`\n${colors.green}Found ${agents.length} agent(s):${colors.reset}`);
    agents.forEach(a => {
      console.log(`  ${colors.cyan}${a.agentId}${colors.reset} on port ${a.port}`);
    });
  }
}

function parseArgs(args) {
  const parsed = { command: null, message: null, options: {} };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (!parsed.command && !arg.startsWith('-')) {
      parsed.command = arg;
    } else if (!parsed.message && !arg.startsWith('-')) {
      parsed.message = arg;
    } else if (arg === '--port' || arg === '-p') {
      parsed.options.port = parseInt(args[++i], 10);
    } else if (arg === '--agent' || arg === '-a') {
      parsed.options.agent = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      parsed.command = 'help';
    }
    i++;
  }

  return parsed;
}

function showHelp() {
  console.log(`
${colors.bright}WAAAH CLI${colors.reset} - Interactive terminal for Antigravity agents

${colors.cyan}Usage:${colors.reset}
  waaah-cli                     Start interactive chat mode
  waaah-cli chat                Start interactive chat mode
  waaah-cli submit <message>    Send a one-shot message
  waaah-cli status              Get agent status
  waaah-cli discover            Find running agents
  waaah-cli help                Show this help

${colors.cyan}Options:${colors.reset}
  --port, -p <port>    Specify agent port (default: 9876)
  --agent, -a <id>     Target specific agent by ID

${colors.cyan}Examples:${colors.reset}
  waaah-cli                                    # Interactive mode
  waaah-cli submit "Build a hello world app"
  waaah-cli --port 9877 chat
  waaah-cli discover
`);
}

async function main() {
  const args = process.argv.slice(2);
  const { command, message, options } = parseArgs(args);
  const port = options.port || DEFAULT_PORT;

  switch (command) {
    case 'submit':
      if (!message) {
        console.error(`${colors.red}Error: Message required${colors.reset}`);
        process.exit(1);
      }
      await oneShot(message, options);
      break;

    case 'status':
      await showStatus(options);
      break;

    case 'discover':
      await discoverAgents();
      break;

    case 'help':
      showHelp();
      break;

    case 'chat':
    case undefined:
    case null:
      await interactiveMode(port);
      break;

    default:
      // Treat unknown command as a message
      await oneShot(command + (message ? ' ' + message : ''), options);
      break;
  }
}

main().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  process.exit(1);
});
