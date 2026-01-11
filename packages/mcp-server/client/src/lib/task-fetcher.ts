
import { apiFetch } from './api';

export const fetchActiveTasks = async (search: string, signal?: AbortSignal) => {
  const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
  const res = await apiFetch(`/admin/tasks?active=true&limit=1000${searchParam}`, { signal });
  if (res.ok) return res.json();
  throw new Error('Failed to fetch active tasks');
};

export const fetchBotStatus = async (signal?: AbortSignal) => {
  const res = await apiFetch(`/admin/bot/status`, { signal });
  if (res.ok) return res.json();
  throw new Error('Failed to fetch bot status');
};

export const fetchStats = async (signal?: AbortSignal) => {
  const res = await apiFetch(`/admin/stats`, { signal });
  if (res.ok) return res.json();
  throw new Error('Failed to fetch stats');
};

export const fetchPaginatedTasks = async (status: string, limit: number, offset: number, search: string, signal?: AbortSignal) => {
  const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
  const res = await apiFetch(`/admin/tasks?limit=${limit}&offset=${offset}&status=${status}${searchParam}`, { signal });
  if (res.ok) return res.json();
  throw new Error(`Failed to fetch ${status} tasks`);
};
