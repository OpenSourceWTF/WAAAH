/**
 * Platform Adapter Interface
 * 
 * Defines the contract that all platform adapters (Discord, Slack, etc) must implement.
 * Allows the core bot logic to be platform-agnostic.
 */

export interface MessageContext {
  /** Original message/event ID */
  messageId: string;
  /** Channel/conversation ID */
  channelId: string;
  /** Server/workspace ID */
  serverId?: string;
  /** Author ID */
  authorId: string;
  /** Author display name */
  authorName: string;
  /** Platform-specific metadata */
  platform: 'discord' | 'slack';
  /** Raw platform-specific data */
  raw?: unknown;
}

export interface TaskEnqueueRequest {
  prompt: string;
  role?: string;
  priority: 'normal' | 'high' | 'critical';
  context: MessageContext;
}

export interface TaskResponse {
  taskId: string;
  status: 'QUEUED' | 'PENDING_ACK' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BLOCKED';
  response?: {
    message: string;
    artifacts?: string[];
  };
}

export interface PlatformAdapter {
  /** Platform name for logging */
  readonly platform: 'discord' | 'slack';

  /** Initialize and connect to the platform */
  connect(): Promise<void>;

  /** Disconnect from the platform */
  disconnect(): Promise<void>;

  /** Reply to a message in the same channel */
  reply(context: MessageContext, message: string): Promise<string>;

  /** Edit a previously sent message */
  editReply(context: MessageContext, replyId: string, message: string): Promise<void>;

  /** Send an embed/rich message (delegation notifications, etc) */
  sendEmbed(channelId: string, embed: EmbedData): Promise<void>;

  /** Register message handler - called by core when messages arrive */
  onMessage(handler: MessageHandler): void;
}

export type MessageHandler = (content: string, context: MessageContext) => Promise<void>;

export interface EmbedData {
  title: string;
  color?: string;
  fields: { name: string; value: string; inline?: boolean }[];
  timestamp?: number;
}
