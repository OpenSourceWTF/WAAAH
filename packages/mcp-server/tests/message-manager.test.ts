
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageManager } from '../src/state/message-manager.js';

describe('MessageManager', () => {
  let messageManager: MessageManager;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      addMessage: vi.fn(),
      getUnreadComments: vi.fn(),
      markCommentsAsRead: vi.fn(),
      getMessages: vi.fn()
    };
    messageManager = new MessageManager(mockRepo);
    vi.clearAllMocks();
  });

  describe('addMessage', () => {
    it('should add a message via repository', () => {
      messageManager.addMessage('task-1', 'user', 'Hello');
      expect(mockRepo.addMessage).toHaveBeenCalledWith('task-1', 'user', 'Hello', undefined, true, undefined);
    });

    it('should handle errors gracefully', () => {
      mockRepo.addMessage.mockImplementation(() => { throw new Error('DB Error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      messageManager.addMessage('task-1', 'user', 'Hello');
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to add message'));
      consoleSpy.mockRestore();
    });

    it('should pass all parameters correctly', () => {
      const metadata = { foo: 'bar' };
      messageManager.addMessage('task-1', 'agent', 'Response', metadata, false, 'progress', 'msg-1');
      expect(mockRepo.addMessage).toHaveBeenCalledWith('task-1', 'agent', 'Response', metadata, false, 'msg-1');
      // Wait, arguments order: taskId, role, content, metadata, isRead, replyTo
      // Original code: this.repo.addMessage(taskId, role, content, metadata, isRead, replyTo);
      // But messageManager.addMessage takes (taskId, role, content, metadata, isRead, messageType, replyTo)
      // And logs messageType.
      
      // Let's check implementation of MessageManager again.
      // this.repo.addMessage(taskId, role, content, metadata, isRead, replyTo);
    });
  });

  describe('addUserComment', () => {
    it('should add a user comment with correct metadata', () => {
      messageManager.addUserComment('task-1', 'Comment');
      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'user', 'Comment', 
        { messageType: 'comment' }, 
        false, 
        undefined
      );
    });

    it('should include images in metadata', () => {
      const images = [{ dataUrl: 'data:image/png...', mimeType: 'image/png', name: 'img.png' }];
      messageManager.addUserComment('task-1', 'Comment', 'reply-1', images);
      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'user', 'Comment', 
        { messageType: 'comment', images }, 
        false, 
        'reply-1'
      );
    });
  });

  describe('getUnreadComments', () => {
    it('should return unread comments from repo', () => {
      const comments = [{ id: '1', content: 'test' }];
      mockRepo.getUnreadComments.mockReturnValue(comments);
      expect(messageManager.getUnreadComments('task-1')).toBe(comments);
    });

    it('should handle errors and return empty array', () => {
      mockRepo.getUnreadComments.mockImplementation(() => { throw new Error('DB Error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(messageManager.getUnreadComments('task-1')).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to get unread comments'));
      consoleSpy.mockRestore();
    });
  });

  describe('markCommentsAsRead', () => {
    it('should delegate to repo', () => {
      mockRepo.markCommentsAsRead.mockReturnValue(5);
      expect(messageManager.markCommentsAsRead('task-1')).toBe(5);
    });

    it('should handle errors and return 0', () => {
      mockRepo.markCommentsAsRead.mockImplementation(() => { throw new Error('DB Error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(messageManager.markCommentsAsRead('task-1')).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to mark comments as read'));
      consoleSpy.mockRestore();
    });
  });

  describe('getMessages', () => {
    it('should return messages from repo', () => {
      const msgs = [{ id: '1', content: 'test' }];
      mockRepo.getMessages.mockReturnValue(msgs);
      expect(messageManager.getMessages('task-1')).toBe(msgs);
    });

    it('should handle errors and return empty array', () => {
      mockRepo.getMessages.mockImplementation(() => { throw new Error('DB Error'); });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(messageManager.getMessages('task-1')).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to get messages'));
      consoleSpy.mockRestore();
    });
  });
});
