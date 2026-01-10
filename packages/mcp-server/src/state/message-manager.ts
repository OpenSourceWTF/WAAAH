
import type { ITaskRepository } from './task-repository.js';

/**
 * Manages message operations for tasks.
 */
export class MessageManager {
  constructor(private readonly repo: ITaskRepository) {}

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
      console.log(`[MessageManager] Added message to task ${taskId} from ${role} (isRead: ${isRead}, type: ${messageType || 'default'}${replyTo ? `, replyTo: ${replyTo}` : ''})`);
    } catch (e: any) {
      console.error(`[MessageManager] Failed to add message to task ${taskId}: ${e.message}`);
    }
  }

  /**
   * Add a user comment to a task (starts as unread for agent pickup).
   * Used for the mailbox feature - live comments during task execution.
   */
  addUserComment(taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]): void {
    const metadata: Record<string, unknown> = { messageType: 'comment' };
    if (images && images.length > 0) {
      metadata.images = images;
    }
    this.addMessage(taskId, 'user', content, metadata, false, 'comment', replyTo);
  }

  /**
   * Get unread user comments for a task (mailbox feature).
   */
  getUnreadComments(taskId: string): Array<{ id: string; content: string; timestamp: number; metadata?: Record<string, any> }> {
    try {
      return this.repo.getUnreadComments(taskId);
    } catch (e: any) {
      console.error(`[MessageManager] Failed to get unread comments for task ${taskId}: ${e.message}`);
      return [];
    }
  }

  /**
   * Mark all unread comments as read for a task.
   */
  markCommentsAsRead(taskId: string): number {
    try {
      return this.repo.markCommentsAsRead(taskId);
    } catch (e: any) {
      console.error(`[MessageManager] Failed to mark comments as read for task ${taskId}: ${e.message}`);
      return 0;
    }
  }

  getMessages(taskId: string): any[] {
    try {
      return this.repo.getMessages(taskId);
    } catch (e: any) {
      console.error(`[MessageManager] Failed to get messages for task ${taskId}: ${e.message}`);
      return [];
    }
  }
}
