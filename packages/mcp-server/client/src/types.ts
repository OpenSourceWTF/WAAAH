/**
 * Task interface matching the Dashboard's Task type
 */
export interface Task {
  id: string;
  command: string;
  prompt: string;
  title?: string;
  status: string;
  text?: string;
  toAgentId?: string;
  toAgentRole?: string;
  response?: Record<string, unknown>;
  context?: Record<string, unknown>;
  history?: { timestamp: number; status: string; agentId?: string; message?: string }[];
  messages?: { timestamp: number; role: 'user' | 'agent' | 'system'; content: string; metadata?: Record<string, unknown> }[];
  createdAt?: number;
  completedAt?: number;
}
