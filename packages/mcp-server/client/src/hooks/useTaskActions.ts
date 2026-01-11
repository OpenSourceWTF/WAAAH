import { useCallback } from 'react';
import { apiFetch } from '../lib/api';

/**
 * Hook providing task-related action handlers
 * Extracted from Dashboard.tsx to reduce complexity
 */
export function useTaskActions(fetchData: () => void) {
  const handleCancelTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/admin/tasks/${id}/cancel`, { method: 'POST' });
      fetchData();
    } catch (error) {
      console.error("Failed to cancel task", error);
    }
  }, [fetchData]);

  const handleRetryTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/admin/tasks/${id}/retry`, { method: 'POST' });
      fetchData();
    } catch (error) {
      console.error("Failed to retry task", error);
    }
  }, [fetchData]);

  const handleApproveTask = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve');
      console.log(`Task ${taskId} approved`);
      fetchData();
    } catch (error) {
      console.error("Failed to approve task", error);
    }
  }, [fetchData]);

  const handleRejectTask = useCallback(async (taskId: string, feedback: string) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback })
      });
      if (!res.ok) throw new Error('Failed to reject');
      console.log(`Task ${taskId} rejected with feedback: ${feedback}`);
      fetchData();
    } catch (error) {
      console.error("Failed to reject task", error);
    }
  }, [fetchData]);

  const handleSendComment = useCallback(async (
    taskId: string,
    content: string,
    replyTo?: string,
    images?: { dataUrl: string; mimeType: string; name: string }[]
  ) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, replyTo, images })
      });
      if (!res.ok) throw new Error('Failed to send comment');
      console.log(`Comment sent to task ${taskId}${replyTo ? ` (reply to ${replyTo})` : ''}${images?.length ? ` with ${images.length} images` : ''}`);
      fetchData();
    } catch (error) {
      console.error("Failed to send comment", error);
    }
  }, [fetchData]);

  const handleAddReviewComment = useCallback(async (
    taskId: string,
    filePath: string,
    lineNumber: number | null,
    content: string
  ) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/review-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, lineNumber, content })
      });
      if (!res.ok) throw new Error('Failed to add review comment');
      console.log(`Review comment added to ${filePath}:${lineNumber || 'file'}`);
      fetchData();
    } catch (error) {
      console.error("Failed to add review comment", error);
    }
  }, [fetchData]);

  return {
    handleCancelTask,
    handleRetryTask,
    handleApproveTask,
    handleRejectTask,
    handleSendComment,
    handleAddReviewComment
  };
}
