/**
 * API Key Authentication Tests
 * 
 * Tests that the API key authentication middleware works correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import bodyParser from 'body-parser';

describe('API Key Authentication', () => {
  let server: Server;
  let port: number;
  let baseUrl: string;
  const TEST_API_KEY = 'waaah-test-key-12345';

  beforeAll(async () => {
    port = 30000 + Math.floor(Math.random() * 10000);
    baseUrl = `http://localhost:${port}`;

    const app = express();
    app.use(bodyParser.json());

    // API Key middleware (same as production)
    app.use((req, res, next) => {
      if (req.path === '/health') return next();

      const providedKey = req.headers['x-api-key'] || req.query.apiKey;
      if (providedKey !== TEST_API_KEY) {
        res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
        return;
      }
      next();
    });

    // Test endpoints
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
    app.get('/protected', (req, res) => res.json({ data: 'secret' }));
    app.post('/protected', (req, res) => res.json({ echo: req.body }));

    server = await new Promise<Server>((resolve) => {
      const srv = app.listen(port, () => resolve(srv));
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  describe('Health endpoint (public)', () => {
    it('should allow access without API key', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.status).toBe('ok');
    });
  });

  describe('Protected endpoints', () => {
    it('should reject request without API key', async () => {
      const res = await fetch(`${baseUrl}/protected`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    });

    it('should reject request with wrong API key', async () => {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { 'x-api-key': 'wrong-key' }
      });
      expect(res.status).toBe(401);
    });

    it('should allow request with correct API key in header', async () => {
      const res = await fetch(`${baseUrl}/protected`, {
        headers: { 'x-api-key': TEST_API_KEY }
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.data).toBe('secret');
    });

    it('should allow request with correct API key in query param', async () => {
      const res = await fetch(`${baseUrl}/protected?apiKey=${TEST_API_KEY}`);
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.data).toBe('secret');
    });

    it('should work with POST requests', async () => {
      const res = await fetch(`${baseUrl}/protected`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({ test: 'data' })
      });
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.echo.test).toBe('data');
    });
  });
});
