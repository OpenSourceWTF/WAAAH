/**
 * Production Database Singleton
 * 
 * This file creates and exports the singleton database instance for production use.
 * Schema and migrations are now centralized in database-factory.ts.
 * 
 * For tests, use createTestContext() from context.ts instead of importing this directly.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { initializeSchema } from './database-factory.js';

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../data/waaah.db');
const CONFIG_PATH = process.env.AGENTS_CONFIG || path.resolve(__dirname, '../../../../config/agents.yaml');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * The singleton BetterSQLite3 database instance.
 * For tests, use createTestContext() from context.ts instead of importing this directly.
 */
export const db = new Database(DB_PATH);
// db.pragma('journal_mode = WAL'); // Better concurrency

// Initialize schema using the centralized function
initializeSchema(db);

// ===== Agent Seeding from YAML =====

interface AgentConfig {
  displayName?: string;
  aliases?: string[];
  capabilities?: string[];
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
        INSERT INTO agents (id, displayName, color, capabilities)
        VALUES (@id, @displayName, @color, @capabilities)
      `);

      const insertAlias = db.prepare(`
        INSERT INTO aliases (alias, agentId) VALUES (@alias, @agentId)
      `);

      const seedTransaction = db.transaction((agents: Record<string, AgentConfig>) => {
        for (const [agentIdKey, data] of Object.entries(agents)) {
          // Agent IDs from YAML are now the keys directly (e.g., "orchestrator-1", "fullstack-1")
          const agentId = agentIdKey;

          insertAgent.run({
            id: agentId,
            displayName: data.displayName || `@${agentId}`,
            color: data.color || null,
            capabilities: JSON.stringify(data.capabilities || ['code-writing'])
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
