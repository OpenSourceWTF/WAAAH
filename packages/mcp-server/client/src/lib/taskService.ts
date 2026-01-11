import { apiFetch } from './api';
import type { Task } from '@/types';

export async function fetchActiveTasks(search: string = '', signal?: AbortSignal): Promise<Task[]> {
  const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
  const res = await apiFetch(`/admin/tasks?active=true&limit=1000${searchParam}`, { signal });
  if (!res.ok) throw new Error('Failed to fetch active tasks');
  return res.json();
}

export async function fetchBotStatus(signal?: AbortSignal): Promise<{ count: number }> {
  const res = await apiFetch(`/admin/bot/status`, { signal });
  if (!res.ok) throw new Error('Failed to fetch bot status');
  return res.json();
}

export async function fetchStats(signal?: AbortSignal): Promise<{ total: number; completed: number }> {
  const res = await apiFetch(`/admin/stats`, { signal });
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

export async function fetchTaskHistory(status: string, pageSize: number, offset: number, search: string = '', signal?: AbortSignal): Promise<Task[]> {
  const searchParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : '';
  const res = await apiFetch(`/admin/tasks?limit=${pageSize}&offset=${offset}&status=${status}${searchParam}`, { signal });
  if (!res.ok) throw new Error(`Failed to fetch ${status} tasks`);
  return res.json();
}