/**
 * SSE (Server-Sent Events) Routes
 * Handles real-time streaming endpoints
 */
import { Router } from 'express';
import { TaskQueue } from '../state/queue.js';
import { eventBus } from '../state/events.js';

interface SSERoutesConfig {
  queue: TaskQueue;
}

export function createSSERoutes({ queue }: SSERoutesConfig): Router {
  const router = Router();

  // Track active SSE connections
  let activeDelegationStreams = 0;

  /**
   * GET /delegations/stream
   * Server-Sent Events (SSE) stream for real-time updates.
   */
  router.get('/delegations/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const onDelegation = (task: any) => {
      res.write(`data: ${JSON.stringify({ type: 'delegation', payload: task })}\n\n`);
    };

    const onCompletion = (task: any) => {
      res.write(`data: ${JSON.stringify({ type: 'completion', payload: task })}\n\n`);
    };

    const onActivity = (activity: any) => {
      res.write(`data: ${JSON.stringify(activity)}\n\n`);
    };

    eventBus.on('delegation', onDelegation);
    queue.on('completion', onCompletion);
    eventBus.on('activity', onActivity);

    activeDelegationStreams++;
    console.log('[SSE] Client connected to delegation/completion stream. Total:', activeDelegationStreams);

    req.on('close', () => {
      eventBus.off('delegation', onDelegation);
      queue.off('completion', onCompletion);
      eventBus.off('activity', onActivity);
      activeDelegationStreams = Math.max(0, activeDelegationStreams - 1);
      console.log('[SSE] Client disconnected from stream. Total:', activeDelegationStreams);
    });
  });

  /**
   * GET /bot/status
   * Get bot connection status
   */
  router.get('/bot/status', (req, res) => {
    res.json({
      connected: activeDelegationStreams > 0,
      count: activeDelegationStreams
    });
  });

  /**
   * GET /events
   * Long-polling endpoint for task completion events
   */
  router.get('/events', async (req, res) => {
    await new Promise(r => setTimeout(r, 5000));
    res.json({ status: 'TIMEOUT' });
  });

  return router;
}
