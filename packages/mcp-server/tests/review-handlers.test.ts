/**
 * Review Handlers Tests
 * 
 * Tests for review workflow tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReviewHandlers } from '../src/mcp/handlers/review-handlers.js';

describe('ReviewHandlers', () => {
  let handlers: ReviewHandlers;
  let mockQueue: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockQueue = {
      updateStatus: vi.fn()
    };

    handlers = new ReviewHandlers(mockQueue);
  });

  describe('scaffold_plan', () => {
    it('generates implementation plan template', async () => {
      const result = await handlers.scaffold_plan({ taskId: 'task-1' });

      expect(result.content[0].text).toContain('# Implementation Plan - task-1');
      expect(result.content[0].text).toContain('Goal Description');
      expect(result.content[0].text).toContain('Proposed Changes');
      expect(result.content[0].text).toContain('Verification Plan');
    });

    it('handles invalid args', async () => {
      const result = await handlers.scaffold_plan({});

      expect((result as any).isError).toBe(true);
    });
  });

  describe('submit_review', () => {
    it('returns error when worktree not found', async () => {
      const result = await handlers.submit_review({
        taskId: 'nonexistent-task',
        message: 'Test commit'
      });

      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain('Worktree');
    });

    it('handles invalid args', async () => {
      const result = await handlers.submit_review({});

      expect((result as any).isError).toBe(true);
    });
  });

  describe('get_review_comments', () => {
    it('retrieves review comments from DB', async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([
            { id: 'c1', content: 'Fix this', resolved: 0 }
          ])
        })
      };

      const result = await handlers.get_review_comments({ taskId: 'task-1' }, mockDb);

      expect(result.content[0].text).toContain('c1');
      expect(result.content[0].text).toContain('Fix this');
    });

    it('handles unresolvedOnly filter', async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([])
        })
      };

      await handlers.get_review_comments({ taskId: 'task-1', unresolvedOnly: true }, mockDb);

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('resolved = 0'));
    });

    it('returns all comments when unresolvedOnly is false', async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          all: vi.fn().mockReturnValue([])
        })
      };

      await handlers.get_review_comments({ taskId: 'task-1', unresolvedOnly: false }, mockDb);

      expect(mockDb.prepare).not.toHaveBeenCalledWith(expect.stringContaining('resolved = 0 AND threadId IS NULL'));
    });
  });

  describe('resolve_review_comment', () => {
    it('resolves comment in DB', async () => {
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          run: vi.fn(),
          get: vi.fn().mockReturnValue({ filePath: 'src/file.ts', lineNumber: 10 })
        })
      };

      const result = await handlers.resolve_review_comment({
        taskId: 'task-1',
        commentId: 'c1'
      }, mockDb);

      expect(result.content[0].text).toContain('resolved');
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('adds agent response when provided', async () => {
      const runFn = vi.fn();
      const mockDb = {
        prepare: vi.fn().mockReturnValue({
          run: runFn,
          get: vi.fn().mockReturnValue({ filePath: 'src/file.ts', lineNumber: 10 })
        })
      };

      await handlers.resolve_review_comment({
        taskId: 'task-1',
        commentId: 'c1',
        response: 'Fixed in commit abc'
      }, mockDb);

      // Should have calls for both update and insert
      expect(runFn).toHaveBeenCalled();
    });
  });
});
