
export interface Agent {
  id: string;
  displayName?: string;
  role: string;
  status: string;
  currentTasks?: string[];
  lastSeen?: number;
  createdAt?: number;
  capabilities?: string[];
  source?: 'cli' | 'ide';
}

export interface TaskMessage {
  id?: string;
  timestamp: number;
  role: 'user' | 'agent' | 'system';
  content: string;
  isRead?: boolean;
  messageType?: 'comment' | 'progress' | 'review_feedback' | 'block_event';
  replyTo?: string;
  metadata?: Record<string, unknown>;
  images?: Array<{ dataUrl: string; mimeType: string; name: string }>;
}

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
  messages?: TaskMessage[];
  createdAt?: number;
  completedAt?: number;
}
