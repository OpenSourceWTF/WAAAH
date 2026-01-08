/**
 * Shared MCP Tool definitions - Single source of truth for tool schemas.
 * These are manually defined JSON schemas that match the Zod schemas in schemas.ts.
 * This approach avoids the memory issues with zod-to-json-schema at compile time.
 */

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'register_agent',
    description: 'Register this agent with the WAAAH system',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Unique identifier for the agent' },
        role: {
          type: 'string',
          enum: ['boss', 'project-manager', 'full-stack-engineer', 'test-engineer', 'ops-engineer', 'designer', 'developer', 'code-monk'],
          description: 'The role of the agent'
        },
        displayName: { type: 'string', description: 'Human-readable name for the agent' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'List of capabilities/tools the agent has' }
      },
      required: ['agentId', 'role']
    }
  },
  {
    name: 'wait_for_prompt',
    description: 'Wait for a task to be assigned (Long Polling)',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'The ID of the agent waiting for a prompt' },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 290)' }
      },
      required: ['agentId']
    }
  },
  {
    name: 'send_response',
    description: 'Send task response/status update',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ID of the task being responded to' },
        status: {
          type: 'string',
          enum: ['QUEUED', 'PENDING_ACK', 'ASSIGNED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'],
          description: 'The final status of the task'
        },
        message: { type: 'string', description: 'A textual response or summary of the result' },
        artifacts: { type: 'array', items: { type: 'string' }, description: 'List of file paths or artifact IDs generated' },
        blockedReason: { type: 'string', description: 'Reason for being blocked, required if status is BLOCKED' }
      },
      required: ['taskId', 'status', 'message']
    }
  },
  {
    name: 'assign_task',
    description: 'Delegate a task to another agent',
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: { type: 'string', description: 'The ID of the agent to assign the task to' },
        sourceAgentId: { type: 'string', description: 'The ID of the agent assigning the task' },
        prompt: { type: 'string', description: 'The task description/prompt' },
        context: { type: 'object', description: 'Additional context data for the task' },
        priority: { type: 'string', enum: ['normal', 'high', 'critical'], description: 'Task priority' }
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
        role: { type: 'string', description: 'Filter agents by role' }
      }
    }
  },
  {
    name: 'get_agent_status',
    description: 'Get status of a specific agent',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'The ID of the agent to check' }
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
        taskId: { type: 'string', description: 'The ID of the task to acknowledge' },
        agentId: { type: 'string', description: 'The ID of the agent acknowledging the task' }
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
  },
  {
    name: 'admin_update_agent',
    description: 'Update agent metadata (admin only)',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'The ID of the agent to update' },
        status: { type: 'string', enum: ['active', 'inactive', 'maintenance'], description: 'New status for the agent' },
        metadata: { type: 'object', description: 'Update metadata key-values' }
      },
      required: ['agentId']
    }
  }
] as const;

export type MCPToolDefinition = typeof MCP_TOOL_DEFINITIONS[number];
