import { Router } from 'express';
import { TaskQueue } from '../state/queue.js';
import { eventBus as appEventBus } from '../state/events.js'; // The EventEmitter one
import { IAgentRegistry } from '../state/registry.js';

interface SSERoutesConfig {
  queue: TaskQueue;
  registry?: IAgentRegistry; // Optional for backward compat if needed, but we'll update server.ts
}

export function createSSERoutes({ queue, registry }: SSERoutesConfig): Router {
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

    appEventBus.on('delegation', onDelegation);
    queue.on('completion', onCompletion);
    appEventBus.on('activity', onActivity);

    activeDelegationStreams++;
    console.log('[SSE] Client connected to delegation/completion stream. Total:', activeDelegationStreams);

    req.on('close', () => {
      appEventBus.off('delegation', onDelegation);
      queue.off('completion', onCompletion);
      appEventBus.off('activity', onActivity);
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
   * Real-time task events stream (Toast Notifications)
   */
  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    console.log('[SSE] Client connected to /admin/events');

    // Send initial status
    if (registry) {
      const agents = registry.getAll();
      res.write(`event: agent:list\n`);
      res.write(`data: ${JSON.stringify(agents)}\n\n`);
    }

    const onTaskCreated = (task: any) => {
      res.write(`event: task:created\n`);
      res.write(`data: ${JSON.stringify(task)}\n\n`);
    };

    // Future: Listen to agent events if registry supports it
    // For now we just send initial list.

    appEventBus.on('task:created', onTaskCreated);

    req.on('close', () => {
      appEventBus.off('task:created', onTaskCreated);
      console.log('[SSE] Client disconnected from /admin/events');
    });
  });

  return router;
}
