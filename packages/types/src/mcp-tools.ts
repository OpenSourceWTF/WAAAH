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
          description: 'The role of the agent. Recommended: boss, orchestrator, code-doctor, project-manager, full-stack-engineer, test-engineer, ops-engineer, designer, developer. Any custom role is allowed.'
        },
        displayName: { type: 'string', description: 'Human-readable name for the agent' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'List of capabilities/tools the agent has' },
        workspaceContext: {
          type: 'object',
          description: 'REQUIRED: Workspace the agent is working in. Infer from git remote.',
          properties: {
            type: { type: 'string', enum: ['local', 'github'], description: 'Workspace type' },
            repoId: { type: 'string', description: 'Repository identifier (e.g., Owner/Repo from git remote)' },
            branch: { type: 'string', description: 'Current branch name' },
            path: { type: 'string', description: 'Local filesystem path' }
          },
          required: ['type', 'repoId']
        },
        source: { type: 'string', enum: ['CLI', 'IDE'], description: 'Source of the agent: CLI (waaah-agent wrapper) or IDE (Cursor/Claude/etc)' }
      },
      required: ['agentId', 'role', 'capabilities', 'workspaceContext']
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
          enum: ['QUEUED', 'PENDING_ACK', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'COMPLETED', 'FAILED', 'BLOCKED', 'CANCELLED'],
          description: 'The final status of the task'
        },
        message: { type: 'string', description: 'A textual response or summary of the result' },
        artifacts: { type: 'array', items: { type: 'string' }, description: 'List of file paths or artifact IDs generated' },
        diff: { type: 'string', description: 'Raw git diff content for code review (REQUIRED for code/test tasks submitting to IN_REVIEW)' },
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
        targetAgentId: { type: 'string', description: 'HINT: Preferred agent ID (adds score, not required)' },
        sourceAgentId: { type: 'string', description: 'The ID of the agent assigning the task (defaults to Da Boss)' },
        prompt: { type: 'string', description: 'The task description/prompt' },
        workspaceId: { type: 'string', description: 'REQUIRED: Repository ID for task routing (e.g., Owner/Repo)' },
        requiredCapabilities: { type: 'array', items: { type: 'string' }, description: 'Capabilities required to execute this task' },
        context: { type: 'object', description: 'Additional context data for the task' },
        spec: { type: 'string', description: 'Raw text of specification document (e.g., spec.md contents)' },
        tasks: { type: 'string', description: 'Raw text of task checklist (e.g., tasks.md contents)' },
        priority: { type: 'string', enum: ['normal', 'high', 'critical'], description: 'Task priority' },
        dependencies: { type: 'array', items: { type: 'string' }, description: 'List of Task IDs that must complete before this task starts' }
      },
      required: ['prompt', 'workspaceId']
    }
  },
  {
    name: 'list_agents',
    description: 'List all registered agents',
    inputSchema: {
      type: 'object',
      properties: {
        capability: { type: 'string', description: 'Filter agents by capability' }
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
  },
  {
    name: 'block_task',
    description: 'Block the current task due to missing information or dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ID of the task to block' },
        reason: { type: 'string', enum: ['clarification', 'dependency', 'decision'], description: 'Category of the blocker' },
        question: { type: 'string', description: 'The question or issue that needs resolution' },
        summary: { type: 'string', description: 'Summary of work done so far' },
        notes: { type: 'string', description: 'Private notes/state to help resumption' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files modified or relevant to the task' }
      },
      required: ['taskId', 'reason', 'question', 'summary']
    }
  },
  {
    name: 'answer_task',
    description: 'Provide an answer to a blocked task (unblock it)',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ID of the blocked task' },
        answer: { type: 'string', description: 'The answer or resolution to the blocker' }
      },
      required: ['taskId', 'answer']
    }
  },
  {
    name: 'get_task_context',
    description: 'Get full context for a task (prompt, history, notes)',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The ID of the task' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'update_progress',
    description: 'Report step-by-step progress during task execution',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to update' },
        agentId: { type: 'string', description: 'ID of the agent reporting progress' },
        phase: { type: 'string', description: 'Current phase (e.g., PLANNING, BUILDING, TESTING)' },
        message: { type: 'string', description: 'Progress observation/message' },
        percentage: { type: 'number', description: 'Optional completion percentage (0-100)' }
      },
      required: ['taskId', 'agentId', 'message']
    }
  },
  {
    name: 'scaffold_plan',
    description: 'Create an implementation plan scaffold for a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The Task ID context for the plan' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'submit_review',
    description: 'Submit task for review with commit message',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The Task ID being submitted' },
        message: { type: 'string', description: 'Commit message and review description' },
        runTests: { type: 'boolean', description: 'Whether to enforce test execution (default: true)' }
      },
      required: ['taskId', 'message']
    }
  },
  {
    name: 'broadcast_system_prompt',
    description: 'Send system-level prompts to agents (workflow updates, config changes, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: { type: 'string', description: 'Specific agent ID to target' },
        targetCapability: { type: 'string', description: 'Target agents with this capability' },
        broadcast: { type: 'boolean', description: 'If true, send to ALL agents' },
        promptType: {
          type: 'string',
          enum: ['WORKFLOW_UPDATE', 'EVICTION_NOTICE', 'CONFIG_UPDATE', 'SYSTEM_MESSAGE'],
          description: 'Type of system prompt'
        },
        message: { type: 'string', description: 'Human-readable message' },
        payload: { type: 'object', description: 'Optional payload data' },
        priority: { type: 'string', enum: ['normal', 'high', 'critical'], description: 'Urgency level' }
      },
      required: ['promptType', 'message']
    }
  },
  {
    name: 'get_review_comments',
    description: 'Get unresolved review comments for a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to get review comments for' },
        unresolvedOnly: { type: 'boolean', description: 'Only return unresolved comments (default: true)' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'resolve_review_comment',
    description: 'Acknowledge and resolve review feedback',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task' },
        commentId: { type: 'string', description: 'ID of the review comment to resolve' },
        response: { type: 'string', description: 'Optional response explaining the fix' }
      },
      required: ['taskId', 'commentId']
    }
  }
] as const;

export type MCPToolDefinition = typeof MCP_TOOL_DEFINITIONS[number];
