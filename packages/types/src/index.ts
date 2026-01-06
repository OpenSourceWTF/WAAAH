// Core Agent Types

export type AgentRole =
  | 'project-manager'
  | 'full-stack-engineer'
  | 'test-engineer'
  | 'ops-engineer'
  | 'designer'
  | 'developer'; // Generic role

export interface AgentIdentity {
  id: string;          // Unique ID (e.g., "fullstack-1")
  role: AgentRole;     // Role of the agent
  displayName: string; // Display name (e.g., "@FullStack")
  capabilities: string[]; // List of skills/tools
}

// Task & Queue Types

export type TaskStatus =
  | 'QUEUED'
  | 'PENDING_ACK'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'TIMEOUT';

export type TaskPriority = 'normal' | 'high' | 'critical';

export interface Task {
  id: string;
  command: 'wait_for_prompt' | 'execute_prompt'; // Internal command type
  prompt: string;         // The actual instruction
  from: {
    type: 'user' | 'agent';
    id: string;
    name: string;
  };
  to: {
    agentId?: string;     // Specific agent
    role?: AgentRole;     // Any agent with this role
  };
  priority: TaskPriority;
  status: TaskStatus;
  response?: TaskResponse; // The result of the task execution
  context?: Record<string, unknown>; // Meta-data (channel ID, etc.)
  createdAt: number;
  timeoutAt?: number;
}

export interface TaskResponse {
  taskId: string;
  status: TaskStatus;
  message: string;
  artifacts?: string[];
  blockedReason?: string;
  completedAt: number;
}

// MCP Tool Arguments Schemas

export interface RegisterAgentArgs {
  agentId: string;
  role: AgentRole;
  displayName: string;
  capabilities: string[];
}

export interface WaitForPromptArgs {
  agentId: string;
  timeout?: number;
}

export interface SendResponseArgs {
  taskId: string;
  status: TaskStatus;
  message: string;
  artifacts?: string[];
  blockedReason?: string;
}


export interface AssignTaskArgs {
  targetAgentId: string;
  prompt: string;
  priority?: TaskPriority;
  context?: Record<string, unknown>;
}

export interface ListAgentsArgs {
  role?: AgentRole;
}

export interface GetAgentStatusArgs {
  agentId: string;
}

export interface AckTaskArgs {
  taskId: string;
  agentId: string;
}

export interface AgentStatus {
  agentId: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeen: number;
  currentTask?: string;
}
