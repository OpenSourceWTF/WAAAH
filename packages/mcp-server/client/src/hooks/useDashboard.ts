import { useState, useCallback } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useTaskData, useAgentData } from './index';
import { apiFetch } from '@/lib/api';

export function useDashboard() {
  const { theme, setTheme, t } = useTheme();
  
  // Search state for server-side filtering
  const [searchQuery, setSearchQuery] = useState('');

  // Use custom hooks for data fetching with deduplication
  const {
    activeTasks,
    recentCompleted,
    recentCancelled,
    stats,
    connected,
    refetch: refetchTasks,
    loadMoreCompleted,
    loadMoreCancelled,
    hasMoreCompleted,
    hasMoreCancelled,
    loadingMore
  } = useTaskData({ pollInterval: 2000, search: searchQuery });

  const {
    agents,
    getRelativeTime,
    refetch: refetchAgents
  } = useAgentData({ pollInterval: 2000 });

  // Combined refetch for backward compatibility with fetchData calls
  const fetchData = useCallback(() => {
    refetchTasks();
    refetchAgents();
  }, [refetchTasks, refetchAgents]);

  // Task Actions
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

  const getStatusBadgeClass = useCallback((status: string) => {
    const base = "text-xs font-bold px-2 py-1 border border-black";
    switch (status) {
      case 'COMPLETED': return `${base} bg-green-600 text-white border-green-800`;
      case 'FAILED':
      case 'CANCELLED': return `${base} bg-red-600 text-white border-red-800`;
      case 'ASSIGNED':
      case 'IN_PROGRESS':
      case 'PROCESSING': return `${base} bg-blue-600 text-white border-blue-800`;
      case 'QUEUED':
      case 'PENDING_ACK':
      case 'WAITING': return `${base} bg-yellow-500 text-black border-yellow-700`;
      case 'BLOCKED':
      case 'PENDING':
      case 'PENDING_RES':
      case 'REVIEW':
      case 'IN_REVIEW': return `${base} bg-white text-black border-gray-400`;
      default: return `${base} bg-gray-600 text-white`;
    }
  }, []);

  return {
    theme, setTheme, t,
    searchQuery, setSearchQuery,
    activeTasks, recentCompleted, recentCancelled, stats, connected,
    loadMoreCompleted, loadMoreCancelled, hasMoreCompleted, hasMoreCancelled, loadingMore,
    agents, getRelativeTime,
    handleCancelTask, handleRetryTask, handleEvictAgent, handleApproveTask, 
    handleRejectTask, handleSendComment, handleAddReviewComment,
    getStatusBadgeClass
  };
}
