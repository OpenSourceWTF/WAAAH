import express from 'express';
import { API_KEY } from './config.js';

/**
 * API Key Authentication Middleware
 * Validates X-API-Key header or apiKey query param
 */
export function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (providedKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    return;
  }
  next();
}
