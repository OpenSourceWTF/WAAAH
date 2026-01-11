/**
 * Periodic agent cleanup logic
 * Extracted from server.ts to reduce complexity
 */
import { emitActivity } from '../state/events.js';
import type { AgentRepository } from '../state/persistence/agent-repository.js';
import type { TaskQueue } from '../state/queue.js';

export function startCleanupInterval(
  registry: AgentRepository,
  queue: TaskQueue,
  intervalMs: number
) {
  return setInterval(() => {
    const busyAgents = queue.getBusyAgentIds();
    const cutoff = Date.now() - intervalMs;
    const all = registry.getAll();
    const protectedAgents = new Set([...busyAgents, ...queue.getWaitingAgents().keys()]);

    for (const a of all) {
      if (a.lastSeen && a.lastSeen < cutoff && !protectedAgents.has(a.id)) {
        emitActivity('AGENT', `Agent ${a.displayName || a.id} disconnected (timeout)`, { agentId: a.id });
      }
    }

    registry.cleanup(intervalMs, protectedAgents);
  }, intervalMs);
}
