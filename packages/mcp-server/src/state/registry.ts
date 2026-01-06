import {
  AgentIdentity,
  AgentRole
} from '@waaah/types';

export class AgentRegistry {
  private agents: Map<string, AgentIdentity> = new Map();
  private lastHeartbeat: Map<string, number> = new Map();

  register(agent: AgentIdentity): void {
    this.agents.set(agent.id, agent);
    this.heartbeat(agent.id);
    console.log(`[Registry] Registered agent: ${agent.id} (${agent.displayName})`);
  }

  get(agentId: string): AgentIdentity | undefined {
    return this.agents.get(agentId);
  }

  getAll(): AgentIdentity[] {
    return Array.from(this.agents.values());
  }

  heartbeat(agentId: string): void {
    this.lastHeartbeat.set(agentId, Date.now());
  }

  // Remove inactive agents after timeout (e.g., 5 mins)
  cleanup(timeoutMs: number = 5 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, lastSeen] of this.lastHeartbeat.entries()) {
      if (now - lastSeen > timeoutMs) {
        this.agents.delete(id);
        this.lastHeartbeat.delete(id);
        console.log(`[Registry] Removed inactive agent: ${id}`);
      }
    }
  }
}
