#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const SERVER_URL = process.env.WAAAH_SERVER_URL || 'http://localhost:3000';
const AGENT_ID = process.env.AGENT_ID || 'unknown-agent';
const AGENT_ROLE = process.env.AGENT_ROLE || 'developer';
const WAAAH_API_KEY = process.env.WAAAH_API_KEY;

// Configure axios to send API key with all requests
if (WAAAH_API_KEY) {
  axios.defaults.headers.common['X-API-Key'] = WAAAH_API_KEY;
}

console.error(`[WAAAH Proxy] Starting for agent ${AGENT_ID} (${AGENT_ROLE}) -> ${SERVER_URL}`);

// Define the tools we expose to Antigravity
const PROXY_TOOLS = [
  {
    name: 'register_agent',
    description: 'Register this agent with the WAAAH system',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        role: { type: 'string' },
        displayName: { type: 'string' },
        capabilities: { type: 'array', items: { type: 'string' } },
      },
      required: ['agentId', 'role'],
    },
  },
  {
    name: 'wait_for_prompt',
    description: 'Wait for a task to be assigned (Long Polling)',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'send_response',
    description: 'Send task response/status update',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['COMPLETED', 'FAILED', 'BLOCKED', 'IN_PROGRESS'] },
        message: { type: 'string' },
        artifacts: { type: 'array', items: { type: 'string' } },
        blockedReason: { type: 'string' },
      },
      required: ['taskId', 'status', 'message'],
    },
  },
  {
    name: 'assign_task',
    description: 'Delegate a task to another agent',
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: { type: 'string' },
        prompt: { type: 'string' },
        priority: { type: 'string', enum: ['normal', 'high', 'critical'] },
        context: { type: 'object' },
        sourceAgentId: { type: 'string', description: 'Your agent ID (the delegating agent)' }
      },
      required: ['targetAgentId', 'prompt']
    }
  },
  {
    name: 'list_agents',
    description: 'List all registered agents',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' }
      }
    }
  },
  {
    name: 'get_agent_status',
    description: 'Get status of a specific agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string' }
      },
      required: ['agentId']
    }
  },
  {
    name: 'ack_task',
    description: 'Acknowledge receipt of a task (required after wait_for_prompt)',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        agentId: { type: 'string' }
      },
      required: ['taskId', 'agentId']
    }
  },
  {
    name: 'wait_for_task',
    description: 'Wait for a specific task to complete (for dependency coordination)',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to wait for completion' },
        timeout: { type: 'number', description: 'Timeout in seconds (default 300)' }
      },
      required: ['taskId']
    }
  }
];

const server = new Server(
  {
    name: 'waaah-proxy',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: PROXY_TOOLS,
  };
});

// Initial self-registration logic (optional, but good for auto-start)
// But we want the agent to call it autonomously via prompt.

// Call Tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Inject agent ID if missing (for convenience)
  const payload = { ...args };
  if (name === 'register_agent' && !payload.agentId) payload.agentId = AGENT_ID;
  if (name === 'wait_for_prompt' && !payload.agentId) payload.agentId = AGENT_ID;

  try {
    console.error(`[Proxy] Calling remote tool: ${name}`);

    // Forward to HTTP Server
    const response = await axios.post(`${SERVER_URL}/mcp/tools/${name}`, payload);

    console.error(`[Proxy] Remote tool success: ${name}`);
    return {
      content: response.data.content,
      isError: response.data.isError
    };
  } catch (error: any) {
    console.error(`[Proxy] Error calling ${name}:`, error.message);

    const errorMessage = error.response?.data?.error || error.message;
    return {
      content: [{ type: 'text', text: `Proxy Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[WAAAH Proxy] Connected via Stdio');
}

run().catch((error) => {
  console.error('[WAAAH Proxy] Fatal error:', error);
  process.exit(1);
});
