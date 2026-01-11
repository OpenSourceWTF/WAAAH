/**
 * Auth Tests
 * 
 * Tests for API key management utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreateApiKey } from '../src/utils/auth.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('getOrCreateApiKey', () => {
  const originalEnv = process.env.WAAAH_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WAAAH_API_KEY = originalEnv;
    } else {
      delete process.env.WAAAH_API_KEY;
    }
    vi.restoreAllMocks();
  });

  it('returns env API key when set', () => {
    process.env.WAAAH_API_KEY = 'test-env-key';
    const key = getOrCreateApiKey();
    expect(key).toBe('test-env-key');
  });

  it('generates a new key when env not set and no credentials file', () => {
    delete process.env.WAAAH_API_KEY;

    // Mock file system to return no existing file
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);

    const key = getOrCreateApiKey();
    expect(key).toMatch(/^waaah-[a-f0-9]{48}$/);
  });

  it('reads from credentials file when it exists', () => {
    delete process.env.WAAAH_API_KEY;

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ 'api-key': 'file-stored-key' }));

    const key = getOrCreateApiKey();
    expect(key).toBe('file-stored-key');
  });

  it('handles corrupted credentials file gracefully', () => {
    delete process.env.WAAAH_API_KEY;

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not valid json');
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined);

    // Should generate new key without throwing
    const key = getOrCreateApiKey();
    expect(key).toMatch(/^waaah-[a-f0-9]{48}$/);
  });

  it('handles file write errors gracefully', () => {
    delete process.env.WAAAH_API_KEY;

    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => { throw new Error('Permission denied'); });
    vi.spyOn(console, 'warn').mockImplementation(() => { });

    // Should still return a key
    const key = getOrCreateApiKey();
    expect(key).toMatch(/^waaah-[a-f0-9]{48}$/);
  });
});
