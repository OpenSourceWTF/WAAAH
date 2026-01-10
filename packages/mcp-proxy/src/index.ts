#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

import { MCP_TOOL_DEFINITIONS } from '@opensourcewtf/waaah-types';

// Parse CLI args for --url
const urlArgIndex = process.argv.indexOf('--url');
const cliUrl = urlArgIndex !== -1 && process.argv[urlArgIndex + 1]
  ? process.argv[urlArgIndex + 1]
  : undefined;

const SERVER_URL = cliUrl || process.env.WAAAH_SERVER_URL || 'http://localhost:3000';
const AGENT_ID = process.env.AGENT_ID || 'unknown-agent';
const AGENT_ROLE = process.env.AGENT_ROLE || 'developer';
const WAAAH_API_KEY = process.env.WAAAH_API_KEY;

// Configure axios to send API key with all requests
if (WAAAH_API_KEY) {
  axios.defaults.headers.common['X-API-Key'] = WAAAH_API_KEY;
}

console.error(`[WAAAH Proxy] Starting for agent ${AGENT_ID} (${AGENT_ROLE}) -> ${SERVER_URL}`);

const server = new Server(
  {
    name: 'waaah-proxy',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {}, // Declare resources capability so handler is allowed
    },
  }
);

// List Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: MCP_TOOL_DEFINITIONS as any,
  };
});

// List Resources (empty - WAAAH doesn't use MCP resources)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [],
  };
});

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
