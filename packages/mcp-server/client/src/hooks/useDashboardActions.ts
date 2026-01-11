
import { useCallback } from 'react';
import { apiFetch } from '../lib/api';

export function useDashboardActions(fetchData: () => void) {
  const handleCancelTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/admin/tasks/${id}/cancel`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to cancel task", error);
    }
  }, [fetchData]);

  const handleRetryTask = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await apiFetch(`/admin/tasks/${id}/retry`, { method: 'POST' });
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to retry task", error);
    }
  }, [fetchData]);

  const handleEvictAgent = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to SHUTDOWN agent ${id}?`)) return;

    try {
      await apiFetch('/admin/evict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, reason: 'Admin Shutdown via Dashboard', action: 'SHUTDOWN' })
      });
      fetchData();
    } catch (error) {
      console.error("Failed to evict agent", error);
    }
  }, [fetchData]);

  const handleApproveTask = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to approve');
      console.log(`Task ${taskId} approved`);
      fetchData(); // Refresh immediately
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
      fetchData(); // Refresh immediately
    } catch (error) {
      console.error("Failed to reject task", error);
    }
  }, [fetchData]);

  const handleSendComment = useCallback(async (taskId: string, content: string, replyTo?: string, images?: { dataUrl: string; mimeType: string; name: string }[]) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, replyTo, images })
      });
      if (!res.ok) throw new Error('Failed to send comment');
      console.log(`Comment sent to task ${taskId}${replyTo ? ` (reply to ${replyTo})` : ''}${images?.length ? ` with ${images.length} images` : ''}`);
      fetchData(); // Refresh to show new comment
    } catch (error) {
      console.error("Failed to send comment", error);
    }
  }, [fetchData]);

  const handleAddReviewComment = useCallback(async (taskId: string, filePath: string, lineNumber: number | null, content: string) => {
    try {
      const res = await apiFetch(`/admin/tasks/${taskId}/review-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, lineNumber, content })
      });
      if (!res.ok) throw new Error('Failed to add review comment');
      console.log(`Review comment added to ${filePath}:${lineNumber || 'file'}`);
      fetchData(); // Refresh to show new comment
    } catch (error) {
      console.error("Failed to add review comment", error);
    }
  }, [fetchData]);

  return {
    handleCancelTask,
    handleRetryTask,
    handleEvictAgent,
    handleApproveTask,
    handleRejectTask,
    handleSendComment,
    handleAddReviewComment
  };
}
