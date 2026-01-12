import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test case (e.g. clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock EventSource
global.EventSource = class EventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  close() { }
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  withCredentials: boolean = false;
  CONNECTING: number = 0;
  OPEN: number = 1;
  CLOSED: number = 2;
  readyState: number = 0;
  addEventListener() { }
  removeEventListener() { }
  dispatchEvent() { return true; }
} as any;
