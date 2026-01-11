/**
 * SSE Routes Tests
 * 
 * Tests for SSE streaming and bot status endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { EventEmitter } from 'events';

// Mock the eventBus module
vi.mock('../src/state/events.js', () => ({
  eventBus: new EventEmitter()
}));

import { createSSERoutes } from '../src/routes/sse-events.js';
import { eventBus } from '../src/state/events.js';

describe('SSE Routes', () => {
  let app: express.Express;
  let mockQueue: any;

  beforeEach(() => {
    mockQueue = new EventEmitter();

    app = express();
    app.use('/', createSSERoutes({ queue: mockQueue }));
  });

  describe('GET /bot/status', () => {
    it('returns disconnected status with no streams', async () => {
      const res = await request(app)
        .get('/bot/status')
        .expect(200);

      expect(res.body.connected).toBe(false);
      expect(res.body.count).toBe(0);
    });
  });

  describe('GET /events', () => {
    it('returns timeout after wait period', async () => {
      // This is a slow test due to the 5s timeout
      // Use a shorter timeout by mocking setTimeout
      vi.useFakeTimers();

      const promise = request(app).get('/events');

      await vi.advanceTimersByTimeAsync(6000);

      vi.useRealTimers();

      const res = await promise;
      expect(res.body.status).toBe('TIMEOUT');
    }, 10000);
  });

  // Note: SSE streaming tests are harder to test with supertest
  // The /delegations/stream endpoint sets up event listeners and streams
});
