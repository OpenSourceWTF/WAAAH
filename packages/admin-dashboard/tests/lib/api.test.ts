import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from '../../src/lib/api';

describe('apiFetch', () => {
  beforeEach(() => {
    // Reset global fetch mock
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call fetch with URL (potentially with base)', async () => {
    await apiFetch('/test');
    // URL may include BASE_URL prefix, so match ending pattern
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/test'),
      expect.any(Object)
    );
  });

  it('should pass custom options to fetch', async () => {
    await apiFetch('/test', { method: 'POST' });
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.method).toBe('POST');
  });

  it('should include headers object', async () => {
    await apiFetch('/test');
    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options.headers).toBeInstanceOf(Headers);
  });

  it('should make fetch call exactly once', async () => {
    await apiFetch('/test');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
