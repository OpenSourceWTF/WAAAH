/**
 * Message Service Tests
 * 
 * Tests for task messaging and comments.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService } from '../src/state/services/message-service.js';

describe('MessageService', () => {
  let service: MessageService;
  let mockRepo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepo = {
      addMessage: vi.fn(),
      getUnreadComments: vi.fn().mockReturnValue([]),
      markCommentsAsRead: vi.fn().mockReturnValue(0),
      getMessages: vi.fn().mockReturnValue([])
    };

    service = new MessageService(mockRepo);
  });

  describe('addMessage', () => {
    it('adds a generic message', () => {
      service.addMessage('task-1', 'user', 'Hello world');

      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'user', 'Hello world', undefined, true, undefined
      );
    });

    it('adds message with metadata', () => {
      const metadata = { important: true };
      service.addMessage('task-1', 'agent', 'Done!', metadata);

      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'agent', 'Done!', metadata, true, undefined
      );
    });

    it('adds message with isRead flag', () => {
      service.addMessage('task-1', 'system', 'Status update', undefined, false);

      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'system', 'Status update', undefined, false, undefined
      );
    });

    it('handles repo errors gracefully', () => {
      mockRepo.addMessage.mockImplementation(() => {
        throw new Error('DB error');
      });

      // Should not throw
      expect(() => service.addMessage('task-1', 'user', 'Test')).not.toThrow();
    });
  });

  describe('addUserComment', () => {
    it('adds user comment as unread', () => {
      service.addUserComment('task-1', 'Please review this');

      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'user', 'Please review this',
        { messageType: 'comment' }, false, undefined
      );
    });

    it('adds user comment with images', () => {
      const images = [{ dataUrl: 'data:image/png;base64,abc', mimeType: 'image/png', name: 'screenshot.png' }];
      service.addUserComment('task-1', 'See attached', undefined, images);

      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'user', 'See attached',
        { messageType: 'comment', images }, false, undefined
      );
    });

    it('adds user comment with replyTo', () => {
      service.addUserComment('task-1', 'Reply to your question', 'msg-123');

      expect(mockRepo.addMessage).toHaveBeenCalledWith(
        'task-1', 'user', 'Reply to your question',
        { messageType: 'comment' }, false, 'msg-123'
      );
    });
  });

  describe('getUnreadComments', () => {
    it('returns unread comments', () => {
      const comments = [{ id: 'c1', content: 'Check this', timestamp: Date.now() }];
      mockRepo.getUnreadComments.mockReturnValue(comments);

      const result = service.getUnreadComments('task-1');

      expect(result).toEqual(comments);
      expect(mockRepo.getUnreadComments).toHaveBeenCalledWith('task-1');
    });

    it('returns empty array on error', () => {
      mockRepo.getUnreadComments.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = service.getUnreadComments('task-1');

      expect(result).toEqual([]);
    });
  });

  describe('markCommentsAsRead', () => {
    it('marks comments as read', () => {
      mockRepo.markCommentsAsRead.mockReturnValue(3);

      const result = service.markCommentsAsRead('task-1');

      expect(result).toBe(3);
      expect(mockRepo.markCommentsAsRead).toHaveBeenCalledWith('task-1');
    });

    it('returns 0 on error', () => {
      mockRepo.markCommentsAsRead.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = service.markCommentsAsRead('task-1');

      expect(result).toBe(0);
    });
  });

  describe('getMessages', () => {
    it('returns all messages', () => {
      const messages = [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'agent', content: 'Hi' }
      ];
      mockRepo.getMessages.mockReturnValue(messages);

      const result = service.getMessages('task-1');

      expect(result).toEqual(messages);
    });

    it('returns empty array on error', () => {
      mockRepo.getMessages.mockImplementation(() => {
        throw new Error('DB error');
      });

      const result = service.getMessages('task-1');

      expect(result).toEqual([]);
    });
  });
});
