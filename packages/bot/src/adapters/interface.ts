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
  /** Whether the message is inside a thread */
  isThread?: boolean;
  /** ID of the thread (if applicable) */
  threadId?: string;
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
  assignedTo?: string; // Agent ID that picked up the task
  response?: {
    message: string;
    artifacts?: string[];
  };
}

/**
 * Interface for Platform Adapters (Discord, Slack, etc.)
 * Standardizes interaction across different chat platforms.
 */
export interface PlatformAdapter {
  platform: 'discord' | 'slack';

  /**
   * Connect to the platform gateway/socket.
   */
  connect(): Promise<void>;

  /**
   * Disconnect and cleanup resources.
   */
  disconnect(): Promise<void>;

  /**
   * Reply to a specific message.
   * @param context - The context of the message being replied to
   * @param message - The text content of the reply
   * @returns The ID of the sent reply message
   */
  reply(context: MessageContext, message: string): Promise<string>;

  /**
   * Edit a previously sent reply.
   * @param context - The context of the original command/message
   * @param replyId - The ID of the reply to edit (returned by reply())
   * @param message - The new text content
   */
  editReply(context: MessageContext, replyId: string, message: string): Promise<void>;

  /**
   * Send a rich embed to a channel.
   * @param channelId - The ID of the target channel
   * @param embed - The embed data to send
   */
  sendEmbed(channelId: string, embed: EmbedData): Promise<void>;

  /**
   * Register a handler for incoming messages.
   * @param handler - The callback function to invoke when a message is received
   */
  onMessage(handler: MessageHandler): void;
}

/**
 * Callback function type for handling incoming messages
 */
export type MessageHandler = (content: string, context: MessageContext) => Promise<void>;

/**
 * Data structure for rich embeds/blocks
 */
export interface EmbedData {
  /** Title of the embed section */
  title: string;
  /** Optional color (hex code) */
  color?: string;
  /** Key-value fields to display */
  fields: {
    name: string;
    value: string;
    inline?: boolean
  }[];
  /** Epoch timestamp (ms) */
  timestamp?: number;
}
