"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let server = null;
let statusBarItem;
const pendingTasks = new Map();
const RESPONSE_DIR = '.waaah-responses';
function getAgentInfo() {
    const config = vscode.workspace.getConfiguration('waaah');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    return {
        id: config.get('agentId') || process.env.WAAAH_AGENT_ID || generateAgentId(),
        role: config.get('agentRole') || 'developer',
        port: config.get('bridgePort') || 9876,
        workspacePath: workspaceFolders?.[0]?.uri.fsPath || 'unknown',
        startedAt: new Date().toISOString()
    };
}
function generateAgentId() {
    const config = vscode.workspace.getConfiguration('waaah');
    const port = config.get('bridgePort') || 9876;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const workspacePath = workspaceFolders?.[0]?.uri.fsPath || 'default';
    const hash = Buffer.from(`${workspacePath}:${port}`).toString('base64').slice(0, 8);
    return `agent-${hash}`;
}
function generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function getResponseDir() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        return path.join(workspaceFolders[0].uri.fsPath, RESPONSE_DIR);
    }
    return path.join(process.cwd(), RESPONSE_DIR);
}
function ensureResponseDir() {
    const dir = getResponseDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
// Watch for response files written by the agent
function setupResponseWatcher() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders)
        return null;
    const pattern = new vscode.RelativePattern(workspaceFolders[0], `${RESPONSE_DIR}/*.json`);
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(async (uri) => {
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            const response = JSON.parse(content.toString());
            if (response.taskId && pendingTasks.has(response.taskId)) {
                const task = pendingTasks.get(response.taskId);
                task.status = 'completed';
                task.response = response.content;
                task.completedAt = new Date();
                console.log(`Response received for task ${response.taskId}`);
            }
        }
        catch (err) {
            console.error('Error reading response file:', err);
        }
    });
    return watcher;
}
async function submitToChat(message, taskId) {
    // Prepend task ID so the agent can reference it in response
    const taggedMessage = `[TASK:${taskId}]\n${message}`;
    await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: taggedMessage
    });
    await new Promise(resolve => setTimeout(resolve, 150));
    await vscode.commands.executeCommand('workbench.action.chat.submit');
}
// Poll for response completion
async function waitForResponse(taskId, timeoutMs) {
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
            }
            catch {
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
function createServer(agentInfo) {
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
            }
            else {
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
                    }
                    else {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Task not found' }));
                    }
                }
                catch (err) {
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
                    const request = JSON.parse(body);
                    if (request.targetAgent && request.targetAgent !== agentInfo.id) {
                        res.writeHead(400);
                        res.end(JSON.stringify({
                            success: false,
                            agentId: agentInfo.id,
                            taskId: '',
                            error: `Wrong agent. Expected: ${request.targetAgent}, Got: ${agentInfo.id}`
                        }));
                        return;
                    }
                    if (!request.message) {
                        res.writeHead(400);
                        res.end(JSON.stringify({
                            success: false,
                            agentId: agentInfo.id,
                            taskId: '',
                            error: 'Missing message field'
                        }));
                        return;
                    }
                    const taskId = generateTaskId();
                    const task = {
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
                        }));
                    }
                    else {
                        // Return immediately with task ID for polling
                        res.writeHead(200);
                        res.end(JSON.stringify({
                            success: true,
                            agentId: agentInfo.id,
                            taskId: taskId
                        }));
                    }
                    vscode.window.showInformationMessage(`WAAAH: Task ${taskId} submitted`);
                }
                catch (error) {
                    res.writeHead(500);
                    res.end(JSON.stringify({
                        success: false,
                        agentId: agentInfo.id,
                        taskId: '',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    }));
                }
            });
            return;
        }
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    });
}
let responseWatcher = null;
function activate(context) {
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
    context.subscriptions.push(vscode.commands.registerCommand('waaah.startBridge', () => startServer(agentInfo)), vscode.commands.registerCommand('waaah.stopBridge', stopServer), vscode.commands.registerCommand('waaah.showStatus', () => showStatus(agentInfo)), vscode.commands.registerCommand('waaah.writeResponse', async (taskId, response) => {
        // Command for programmatic response writing
        const task = pendingTasks.get(taskId);
        if (task) {
            task.status = 'completed';
            task.response = response;
            task.completedAt = new Date();
        }
    }));
    const config = vscode.workspace.getConfiguration('waaah');
    if (config.get('autoStart')) {
        startServer(agentInfo);
    }
    console.log(`WAAAH Agent Bridge activated. Agent ID: ${agentInfo.id}`);
}
function startServer(agentInfo) {
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
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            vscode.window.showErrorMessage(`Port ${agentInfo.port} is already in use.`);
        }
        else {
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
function showStatus(agentInfo) {
    const status = server ? 'Running' : 'Stopped';
    vscode.window.showInformationMessage(`WAAAH: ${status} | ID: ${agentInfo.id} | Port: ${agentInfo.port} | Tasks: ${pendingTasks.size}`);
}
function deactivate() {
    if (server) {
        server.close();
        server = null;
    }
}
//# sourceMappingURL=extension.js.map