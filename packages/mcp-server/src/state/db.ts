import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { AgentRole } from '@waaah/types';

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data/waaah.db');
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.resolve(__dirname, '../../../../config/agents.yaml');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);
// db.pragma('journal_mode = WAL'); // Better concurrency

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    displayName TEXT NOT NULL,
    color TEXT,
    capabilities TEXT, -- JSON array
    lastSeen INTEGER,
    canDelegateTo TEXT -- JSON array
  );

  CREATE TABLE IF NOT EXISTS aliases (
    alias TEXT PRIMARY KEY,
    agentId TEXT NOT NULL,
    FOREIGN KEY(agentId) REFERENCES agents(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    prompt TEXT NOT NULL,
    priority TEXT,
    fromAgentId TEXT,
    fromAgentName TEXT,
    toAgentId TEXT, -- Target agent ID (optional)
    toAgentRole TEXT, -- Target role (optional)
    context TEXT, -- JSON
    response TEXT, -- JSON
    createdAt INTEGER NOT NULL,
    completedAt INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_aliases_agentId ON aliases(agentId);
`);

interface AgentConfig {
  displayName?: string;
  aliases?: string[];
  canDelegateTo?: string[];
  color?: string;
}

interface AgentsYaml {
  agents: Record<string, AgentConfig>;
}

// Seed from YAML if empty
const agentCount = db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };

if (agentCount.count === 0) {
  console.log('[DB] Seeding database from agents.yaml...');
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = yaml.load(content) as AgentsYaml;

      const insertAgent = db.prepare(`
        INSERT INTO agents (id, role, displayName, color, capabilities, canDelegateTo)
        VALUES (@id, @role, @displayName, @color, @capabilities, @canDelegateTo)
      `);

      const insertAlias = db.prepare(`
        INSERT INTO aliases (alias, agentId) VALUES (@alias, @agentId)
      `);

      const seedTransaction = db.transaction((agents: Record<string, AgentConfig>) => {
        for (const [role, data] of Object.entries(agents)) {
          // For seeding, we'll assume a default ID structure like "role-1" if not known,
          // OR we just store the "role configuration" as a template.
          // BUT, currently agents register themselves dynamically.
          // So actually, we should probably store "Role Configurations" or pre-register system agents?
          // The request was: "The yaml should be the bootstrap file if the sqlite does not exist."
          // Since agents register continuously, maybe we don't *Seed* agents, but we load *Defaults*?
          // Wait, the user said "renaming the agent's human readable name".
          // This implies the agent identity persists.

          // Let's pre-seed "slots" for the standard roles so they "own" the display name?
          // Actually, our current model is agents come online and say "I am fullstack-1".
          // So we should maybe just upsert configuration when an agent registers?

          // RE-READING: "The yaml should be the bootstrap file" implies we should load it.
          // But our AgentRegistry is dynamic. 
          // Let's seed "Known Roles" into a config table? Or pre-create agents?
          // Let's assume for now that accurate "Identity" = "agentId".
          // In workflows we use "fullstack-1". Let's seed that.

          // Mapping role -> assumed ID for bootstrapping
          let agentId = '';
          if (role === 'project-manager') agentId = 'pm-1';
          else if (role === 'full-stack-engineer') agentId = 'fullstack-1';
          else if (role === 'test-engineer') agentId = 'test-1';
          else if (role === 'ops-engineer') agentId = 'ops-1';
          else if (role === 'designer') agentId = 'design-1';
          else agentId = `${role}-1`; // Fallback

          insertAgent.run({
            id: agentId,
            role: role,
            displayName: data.displayName || `@${role}`,
            color: data.color || null,
            capabilities: JSON.stringify([]), // Will be updated on registration
            canDelegateTo: JSON.stringify(data.canDelegateTo || [])
          });

          if (data.aliases) {
            for (const alias of data.aliases) {
              try {
                insertAlias.run({ alias: alias.toLowerCase(), agentId });
                insertAlias.run({ alias: `@${alias.toLowerCase()}`, agentId });
              } catch (e) {
                // Ignore duplicates
              }
            }
            // Also add displayName as alias
            if (data.displayName) {
              try {
                insertAlias.run({ alias: data.displayName.toLowerCase(), agentId });
              } catch (e) { }
            }
          }
        }
      });

      if (config?.agents) {
        seedTransaction(config.agents);
        console.log('[DB] Seeding complete.');
      }
    } else {
      console.warn(`[DB] Config file not found at ${CONFIG_PATH}, skipping seed.`);
    }
  } catch (e: any) {
    console.error(`[DB] Failed to seed database: ${e.message}`);
  }
}
