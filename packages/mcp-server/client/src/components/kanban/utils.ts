// Utility functions for Kanban components
import type { Task } from './types';

export const getStatusBadgeClass = (status: string): string => {
  const base = "text-xs font-bold px-2 py-1 border border-black";
  switch (status) {
    case 'COMPLETED': return `${base} bg-green-600 text-white border-green-800`;
    case 'FAILED':
    case 'CANCELLED': return `${base} bg-red-600 text-white border-red-800`;
    case 'ASSIGNED':
    case 'IN_PROGRESS':
    case 'PROCESSING': return `${base} bg-blue-600 text-white border-blue-800`;
    case 'QUEUED':
    case 'PENDING':
    case 'PENDING_ACK':
    case 'PENDING_RES':
    case 'WAITING': return `${base} bg-amber-500 text-black border-amber-700`;
    case 'BLOCKED':
    case 'IN_REVIEW':
    case 'REVIEW': return `${base} bg-white text-black border-gray-400`;
    case 'APPROVED': return `${base} bg-green-400 text-black border-green-600`;
    default: return `${base} bg-gray-600 text-white`;
  }
};

export const formatDate = (ts?: number): string => {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
};

export const getDuration = (start?: number, end?: number): string => {
  if (!start) return '';
  const endTime = end || Date.now();
  const diff = Math.max(0, endTime - start);
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (mins > 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

// Use this in UI - shows final duration for terminal states
export const getTaskDuration = (task: { status: string; createdAt?: number; completedAt?: number }): string => {
  if (!task.createdAt) return '';
  // For terminal states, show final duration
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) && task.completedAt) {
    return getDuration(task.createdAt, task.completedAt);
  }
  // For active tasks, show live duration
  return getDuration(task.createdAt);
};

export const formatTaskTitle = (task: Task): string => {
  if (task.title) return task.title;
  if (task.prompt) {
    const firstLine = task.prompt.split('\n')[0].trim();
    return firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
  }
  return task.command || 'Untitled Task';
};

export const formatResponse = (response: Record<string, unknown> | string | null | undefined): string => {
  if (!response) return 'No output yet.';
  if (typeof response === 'string') return response;
  if (response.output && typeof response.output === 'string') return response.output;
  if (response.message && typeof response.message === 'string') return response.message;
  if (response.content && typeof response.content === 'string') return response.content;
  if (response.error && typeof response.error === 'string') return `ERROR: ${response.error}`;
  return JSON.stringify(response, null, 2);
};

export const getProgressUpdates = (task: Task): Task['messages'] => {
  if (!task.messages) return [];
  return task.messages.filter(m =>
    m.role === 'agent' && m.metadata && (m.metadata as Record<string, unknown>).percentage !== undefined
  );
};
