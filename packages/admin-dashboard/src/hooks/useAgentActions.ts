import { useCallback } from 'react';
import { apiFetch } from '../lib/api';

/**
 * Hook providing agent-related action handlers
 * Extracted from Dashboard.tsx to reduce complexity
 */
export function useAgentActions(fetchData: () => void) {
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

  return { handleEvictAgent };
}

/**
 * Helper for status badge styling
 * Pure function - doesn't need to be in a hook
 */
export function getStatusBadgeClass(status: string): string {
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
}
