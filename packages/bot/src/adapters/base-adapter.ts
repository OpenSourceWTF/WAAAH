/**
 * Base Adapter
 * 
 * Shared logic for platform adapters.
 */
import { PlatformAdapter, MessageContext, EmbedData, MessageHandler } from './interface.js';

export abstract class BaseAdapter implements PlatformAdapter {

  abstract readonly platform: 'discord' | 'slack';
  protected messageHandler?: MessageHandler;
  protected replyCache = new Map<string, unknown>();
  protected approvedUsers: Set<string>;

  constructor(approvedUsers: Set<string>) {
    this.approvedUsers = approvedUsers;
  }

  // Abstract methods for platform-specific implementation
  protected abstract performConnect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  // Wrapper with auto-reconnection logic
  async connect(): Promise<void> {
    await this.exponentialBackoff(async () => {
      await this.performConnect();
    });
  }

  protected async exponentialBackoff(
    operation: () => Promise<void>,
    maxRetries: number = -1, // Infinite
    baseDelay: number = 1000,
    maxDelay: number = 30000
  ): Promise<void> {
    let retries = 0;
    while (true) {
      try {
        await operation();
        return; // Success
      } catch (err: any) {
        if (maxRetries >= 0 && retries >= maxRetries) {
          this.error(`Max retries reached. Giving up.`);
          throw err;
        }

        const delay = Math.min(baseDelay * Math.pow(1.5, retries), maxDelay);
        this.error(`Connection failed: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      }
    }
  }

  abstract reply(context: MessageContext, message: string): Promise<string>;
  abstract editReply(context: MessageContext, replyId: string, message: string): Promise<void>;
  abstract sendEmbed(channelId: string, embed: EmbedData): Promise<void>;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Process an incoming message: validate user, log, and trigger handler.
   */
  protected async processMessage(content: string, context: MessageContext): Promise<void> {
    // 1. Validate User
    if (!this.isUserApproved(context.authorId)) {
      this.log(`Ignoring message from unauthorized user: ${context.authorName} (${context.authorId})`);
      return;
    }

    // 2. Log processing
    this.log(`Processing message from ${context.authorName} in ${context.channelId}`);

    // 3. Trigger Handler
    if (this.messageHandler) {
      try {
        await this.messageHandler(content, context);
      } catch (err) {
        this.error(`Error handling message: ${err}`);
      }
    }
  }

  /**
   * Check if a user is authorized to use the bot
   */
  protected isUserApproved(userId: string): boolean {
    if (this.approvedUsers.size === 0) return true;
    return this.approvedUsers.has(userId);
  }

  /**
   * Determine if the bot should reply in a thread based on env config or context
   */
  protected shouldReplyInThread(context: MessageContext, platformEnvKey: string): boolean {
    // US-1: Strict check for 'true' string (case-sensitive as per requirement US-1 edge cases)
    // "DISCORD_FORCE_THREADING=TRUE" should return false.
    const forceThread = process.env[platformEnvKey] === 'true';
    const continueThread = !!context.isThread;

    // Reply in thread if configured via env OR if the message is already in a thread
    return forceThread || continueThread;
  }

  /**
   * Cache a reply object/ID for later editing
   */
  protected cacheReply(contextId: string, reply: unknown): void {
    this.replyCache.set(`${contextId}:reply`, reply);
  }

  /**
   * Retrieve a cached reply
   */
  protected getCachedReply<T>(contextId: string): T | undefined {
    return this.replyCache.get(`${contextId}:reply`) as T | undefined;
  }

  /**
   * Helper to log with platform prefix
   */
  protected log(message: string, ...args: any[]): void {
    const platformName = this.platform.charAt(0).toUpperCase() + this.platform.slice(1);
    console.log(`[${platformName}] ${message}`, ...args);
  }

  protected error(message: string, ...args: any[]): void {
    const platformName = this.platform.charAt(0).toUpperCase() + this.platform.slice(1);
    console.error(`[${platformName}] ${message}`, ...args);
  }
}
