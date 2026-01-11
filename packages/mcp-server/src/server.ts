/**
 * Main Express server entry point for the WAAAH MCP.
 * Configures middleware, API routes, and tool handling.
 */
import { createProductionContext } from './state/context.js';
import { CLEANUP_INTERVAL_MS } from '@opensourcewtf/waaah-types';
import { emitActivity } from './state/events.js';
import { createApp } from './server/app.js';
import { PORT } from './server/config.js';

// Create production context with all dependencies
const ctx = createProductionContext();
const { registry, queue } = ctx;

// Start Scheduler
queue.startScheduler();

const app = createApp(ctx);

let server: any;

if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`WAAAH MCP Server running on port ${PORT}`);
  });
}

export { app, server };

// Graceful Shutdown
const shutdown = () => {
  console.log('Shutting down WAAAH MCP Server...');
  if (server) server.close();
  queue.stopScheduler();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (server) {
  server.on('error', (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`❌ Port ${PORT} is already in use.`);
      console.error('   Hint: Another WAAAH server might be running in the background.');
      process.exit(1);
    } else {
      console.error('❌ Server error:', e.message);
    }
  });
}

// Periodic cleanup of offline agents
setInterval(() => {
  const busyAgents = queue.getBusyAgentIds();
  const cutoff = Date.now() - CLEANUP_INTERVAL_MS;
  const all = registry.getAll();
  const protectedAgents = new Set([...busyAgents, ...queue.getWaitingAgents().keys()]);

  for (const a of all) {
    if (a.lastSeen && a.lastSeen < cutoff && !protectedAgents.has(a.id)) {
      emitActivity('AGENT', `Agent ${a.displayName || a.id} disconnected (timeout)`, { agentId: a.id });
    }
  }

  registry.cleanup(CLEANUP_INTERVAL_MS, protectedAgents);
}, CLEANUP_INTERVAL_MS);