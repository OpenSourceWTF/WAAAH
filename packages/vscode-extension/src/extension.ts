import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

let server: http.Server | null = null;
let statusBarItem: vscode.StatusBarItem;

// Response tracking
interface PendingTask {
  id: string;
  message: string;
  submittedAt: Date;
  status: 'pending' | 'completed' | 'failed' | 'timeout';
  response?: string;
  completedAt?: Date;
}

const pendingTasks = new Map<string, PendingTask>();
const RESPONSE_DIR = '.waaah-responses';

interface AgentInfo {
  id: string;
  role: string;
  port: number;
  workspacePath: string;
  startedAt: string;
}

interface SubmitRequest {
  message: string;
  targetAgent?: string;
  waitForResponse?: boolean;
  timeoutMs?: number;
}

interface SubmitResponse {
  success: boolean;
  agentId: string;
  taskId: string;
  response?: string;
  error?: string;
}

function getAgentInfo(): AgentInfo {
  const config = vscode.workspace.getConfiguration('waaah');
  const workspaceFolders = vscode.workspace.workspaceFolders;

  return {
    id: config.get<string>('agentId') || process.env.WAAAH_AGENT_ID || generateAgentId(),
    role: config.get<string>('agentRole') || 'developer',
    port: config.get<number>('bridgePort') || 9876,
    workspacePath: workspaceFolders?.[0]?.uri.fsPath || 'unknown',
    startedAt: new Date().toISOString()
  };
}

function generateAgentId(): string {
  const config = vscode.workspace.getConfiguration('waaah');
  const port = config.get<number>('bridgePort') || 9876;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspacePath = workspaceFolders?.[0]?.uri.fsPath || 'default';
  const hash = Buffer.from(`${workspacePath}:${port}`).toString('base64').slice(0, 8);
  return `agent-${hash}`;
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getResponseDir(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders) {
    return path.join(workspaceFolders[0].uri.fsPath, RESPONSE_DIR);
  }
  return path.join(process.cwd(), RESPONSE_DIR);
}

function ensureResponseDir(): void {
  const dir = getResponseDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Watch for response files written by the agent
function setupResponseWatcher(): vscode.FileSystemWatcher | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) return null;

  const pattern = new vscode.RelativePattern(
    workspaceFolders[0],
    `${RESPONSE_DIR}/*.json`
  );

  const watcher = vscode.workspace.createFileSystemWatcher(pattern);

  watcher.onDidCreate(async (uri) => {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const response = JSON.parse(content.toString());

      if (response.taskId && pendingTasks.has(response.taskId)) {
        const task = pendingTasks.get(response.taskId)!;
        task.status = 'completed';
        task.response = response.content;
        task.completedAt = new Date();
        console.log(`Response received for task ${response.taskId}`);
      }
    } catch (err) {
      console.error('Error reading response file:', err);
    }
  });

  return watcher;
}

async function submitToChat(message: string, taskId: string): Promise<void> {
  // Prepend task ID so the agent can reference it in response
  const taggedMessage = `[TASK:${taskId}]\n${message}`;

  await vscode.commands.executeCommand('workbench.action.chat.open', {
    query: taggedMessage
  });

  await new Promise(resolve => setTimeout(resolve, 150));
  await vscode.commands.executeCommand('workbench.action.chat.submit');
}

// Poll for response completion
async function waitForResponse(taskId: string, timeoutMs: number): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const task = pendingTasks.get(taskId);
    if (task?.status === 'completed' && task.response) {
      return task.response;
    }

    // Also check for response file directly
    const responseFile = path.join(getResponseDir(), `${taskId}.json`);
    if (fs.existsSync(responseFile)) {
      try {
        const content = fs.readFileSync(responseFile, 'utf-8');
        const data = JSON.parse(content);
        return data.content || data.response || content;
      } catch {
        // Continue polling
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  const task = pendingTasks.get(taskId);
  if (task) {
    task.status = 'timeout';
  }
  return null;
}

function createServer(agentInfo: AgentInfo): http.Server {
  return http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // GET /status
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'active',
        agent: agentInfo,
        pendingTasks: pendingTasks.size
      }));
      return;
    }

    // GET /health
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, agentId: agentInfo.id }));
      return;
    }

    // GET /tasks - List all pending tasks
    if (req.method === 'GET' && req.url === '/tasks') {
      const tasks = Array.from(pendingTasks.values()).map(t => ({
        id: t.id,
        status: t.status,
        message: t.message.slice(0, 100),
        submittedAt: t.submittedAt
      }));
      res.writeHead(200);
      res.end(JSON.stringify({ tasks }));
      return;
    }

    // GET /task/:id - Check task status
    if (req.method === 'GET' && req.url?.startsWith('/task/')) {
      const taskId = req.url.slice(6);
      const task = pendingTasks.get(taskId);

      if (task) {
        res.writeHead(200);
        res.end(JSON.stringify(task));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Task not found' }));
      }
      return;
    }

    // POST /respond/:taskId - Agent writes response back
    if (req.method === 'POST' && req.url?.startsWith('/respond/')) {
      const taskId = req.url.slice(9);
      let body = '';

      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const task = pendingTasks.get(taskId);

          if (task) {
            task.status = 'completed';
            task.response = data.response;
            task.completedAt = new Date();

            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Task not found' }));
          }
        } catch (err) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // POST /submit
    if (req.method === 'POST' && req.url === '/submit') {
      let body = '';

      req.on('data', chunk => { body += chunk; });

      req.on('end', async () => {
        try {
          const request: SubmitRequest = JSON.parse(body);

          if (request.targetAgent && request.targetAgent !== agentInfo.id) {
            res.writeHead(400);
            res.end(JSON.stringify({
              success: false,
              agentId: agentInfo.id,
              taskId: '',
              error: `Wrong agent. Expected: ${request.targetAgent}, Got: ${agentInfo.id}`
            } as SubmitResponse));
            return;
          }

          if (!request.message) {
            res.writeHead(400);
            res.end(JSON.stringify({
              success: false,
              agentId: agentInfo.id,
              taskId: '',
              error: 'Missing message field'
            } as SubmitResponse));
            return;
          }

          const taskId = generateTaskId();
          const task: PendingTask = {
            id: taskId,
            message: request.message,
            submittedAt: new Date(),
            status: 'pending'
          };
          pendingTasks.set(taskId, task);

          // Ensure response directory exists
          ensureResponseDir();

          // Submit to chat
          await submitToChat(request.message, taskId);

          // If waiting for response
          if (request.waitForResponse) {
            const timeoutMs = request.timeoutMs || 120000; // 2 min default
            const response = await waitForResponse(taskId, timeoutMs);

            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              agentId: agentInfo.id,
              taskId: taskId,
              response: response || '(timeout - no response received)'
            } as SubmitResponse));
          } else {
            // Return immediately with task ID for polling
            res.writeHead(200);
            res.end(JSON.stringify({
              success: true,
              agentId: agentInfo.id,
              taskId: taskId
            } as SubmitResponse));
          }

          vscode.window.showInformationMessage(`WAAAH: Task ${taskId} submitted`);

        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({
            success: false,
            agentId: agentInfo.id,
            taskId: '',
            error: error instanceof Error ? error.message : 'Unknown error'
          } as SubmitResponse));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

let responseWatcher: vscode.FileSystemWatcher | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log('WAAAH Agent Bridge activating...');

  const agentInfo = getAgentInfo();

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'waaah.showStatus';
  context.subscriptions.push(statusBarItem);

  // Set up response watcher
  responseWatcher = setupResponseWatcher();
  if (responseWatcher) {
    context.subscriptions.push(responseWatcher);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('waaah.startBridge', () => startServer(agentInfo)),
    vscode.commands.registerCommand('waaah.stopBridge', stopServer),
    vscode.commands.registerCommand('waaah.showStatus', () => showStatus(agentInfo)),
    vscode.commands.registerCommand('waaah.writeResponse', async (taskId: string, response: string) => {
      // Command for programmatic response writing
      const task = pendingTasks.get(taskId);
      if (task) {
        task.status = 'completed';
        task.response = response;
        task.completedAt = new Date();
      }
    })
  );

  const config = vscode.workspace.getConfiguration('waaah');
  if (config.get<boolean>('autoStart')) {
    startServer(agentInfo);
  }

  console.log(`WAAAH Agent Bridge activated. Agent ID: ${agentInfo.id}`);
}

function startServer(agentInfo: AgentInfo) {
  if (server) {
    vscode.window.showWarningMessage('WAAAH Bridge server is already running');
    return;
  }

  server = createServer(agentInfo);

  server.listen(agentInfo.port, '127.0.0.1', () => {
    const msg = `WAAAH Bridge running on port ${agentInfo.port} (Agent: ${agentInfo.id})`;
    console.log(msg);
    vscode.window.showInformationMessage(msg);

    statusBarItem.text = `$(radio-tower) WAAAH: ${agentInfo.id}`;
    statusBarItem.tooltip = `Port: ${agentInfo.port}\nRole: ${agentInfo.role}\nClick for details`;
    statusBarItem.show();
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      vscode.window.showErrorMessage(`Port ${agentInfo.port} is already in use.`);
    } else {
      vscode.window.showErrorMessage(`WAAAH Bridge error: ${err.message}`);
    }
    server = null;
    statusBarItem.hide();
  });
}

function stopServer() {
  if (server) {
    server.close(() => {
      vscode.window.showInformationMessage('WAAAH Bridge server stopped');
      statusBarItem.hide();
    });
    server = null;
  }
}

function showStatus(agentInfo: AgentInfo) {
  const status = server ? 'Running' : 'Stopped';
  vscode.window.showInformationMessage(
    `WAAAH: ${status} | ID: ${agentInfo.id} | Port: ${agentInfo.port} | Tasks: ${pendingTasks.size}`
  );
}

export function deactivate() {
  if (server) {
    server.close();
    server = null;
  }
}
