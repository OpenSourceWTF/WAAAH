/**
 * API utilities for the admin dashboard
 * 
 * Handles API key authentication via environment variables.
 * Vite loads from root .env (configured via envDir in vite.config.ts)
 */

// VITE_ prefix required for Vite to expose env vars to client
export const API_KEY = import.meta.env.VITE_WAAAH_API_KEY || '';
export const BASE_URL = import.meta.env.VITE_API_URL || '';

/**
 * Make an authenticated fetch request
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  if (API_KEY) {
    headers.set('X-API-Key', API_KEY);
  }

  return fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });
}
