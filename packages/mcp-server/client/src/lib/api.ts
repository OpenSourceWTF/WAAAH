/**
 * API utilities for the admin dashboard
 * 
 * Handles API key authentication via environment variables.
 * Uses WAAAH_API_KEY (exposed via Vite's envPrefix config)
 */

// Vite exposes WAAAH_* env vars via import.meta.env
const API_KEY = import.meta.env.WAAAH_API_KEY || '';
const BASE_URL = import.meta.env.WAAAH_SERVER_URL || 'http://localhost:3000';

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

export { BASE_URL, API_KEY };
