
import { Request, Response, NextFunction } from 'express';
import { getOrCreateApiKey } from '../utils/auth.js';

const API_KEY = getOrCreateApiKey();

/**
 * API Key Authentication Middleware
 * Validates X-API-Key header or apiKey query param
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const providedKey = req.headers['x-api-key'] || req.query.apiKey;
  if (providedKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
    return;
  }
  next();
}
