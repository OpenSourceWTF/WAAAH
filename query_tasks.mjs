import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('packages/mcp-server/data/waaah.db');
const db = new Database(dbPath);

const tasks = db.prepare("SELECT id, status, prompt, toAgentId, toAgentRole FROM tasks WHERE status IN ('QUEUED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_ACK')").all();
console.log(JSON.stringify(tasks, null, 2));
