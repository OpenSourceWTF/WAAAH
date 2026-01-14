import type { ITaskRepository } from '../persistence/task-repository.js';

/**
 * Service for handling task messages and comments.
 */
export class MessageService {
  constructor(private readonly repo: ITaskRepository) {}

  /**
   * Add a generic message to a task.
   */
  addMessage(
    taskId: string,
    role: 'user' | 'agent' | 'system',
    content: string,
    metadata?: Record<string, unknown>,
    isRead: boolean = true,
    messageType?: 'comment' | 'review_feedback' | 'progress' | 'block_event',
    replyTo?: string
  ): void {
    try {
      this.repo.addMessage(taskId, role, content, metadata, isRead, replyTo);
      console.log(`[MessageService] Added message to task ${taskId} from ${role} (type: ${messageType || 'default'})`);
    } catch (e: unknown) {
      console.error(`[MessageService] Failed to add message to task ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Add a user comment to a task (starts as unread for agent pickup).
   * Used for the mailbox feature - live comments during task execution.
   */
  addUserComment(
    taskId: string,
    content: string,
    replyTo?: string,
    images?: { dataUrl: string; mimeType: string; name: string }[]
  ): void {
    const metadata: Record<string, unknown> = { messageType: 'comment' };
    if (images && images.length > 0) {
      metadata.images = images;
    }
    this.addMessage(taskId, 'user', content, metadata, false, 'comment', replyTo);
  }

  /**
   * Get unread user comments for a task (mailbox feature).
   */
  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, unknown> }> {
    try {
      return this.repo.getUnreadComments(taskId);
    } catch (e: unknown) {
      console.error(`[MessageService] Failed to get unread comments for task ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  /**
   * Mark all unread comments as read for a task.
   */
  markCommentsAsRead(taskId: string): number {
    try {
      return this.repo.markCommentsAsRead(taskId);
    } catch (e: unknown) {
      console.error(`[MessageService] Failed to mark comments as read for task ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }

  /**
   * Get all messages for a task.
   */
  getMessages(taskId: string): unknown[] {
    try {
      return this.repo.getMessages(taskId);
    } catch (e: unknown) {
      console.error(`[MessageService] Failed to get messages for task ${taskId}: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }
}