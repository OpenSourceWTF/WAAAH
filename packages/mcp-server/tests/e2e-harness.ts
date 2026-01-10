/**
 * E2E Test Harness
 * 
 * PRODUCTION IS SACROSANCT - this harness GUARANTEES:
 * 1. ALWAYS uses in-memory database (never file-based)
 * 2. ALWAYS uses a random high port (never 3000)
 * 3. ALWAYS isolated - no shared state between tests
 * 4. GUARDS against accidental production connections
 */

import express from 'express';
import type { Server } from 'http';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createTestContext, type TestContext } from './harness.js';
import { ToolHandler } from '../src/mcp/tools.js';
import { createTaskRoutes, createReviewRoutes, createAgentRoutes } from '../src/routes/index.js';

// SAFETY: Use random high ports ONLY (30000-40000 range)
// This ensures we NEVER accidentally bind to production port 3000
function getRandomTestPort(): number {
  return 30000 + Math.floor(Math.random() * 10000);
}

export interface E2ETestServer {
  /** Base URL for the test server */
  baseUrl: string;
  /** The port the server is running on */
  port: number;
  /** The test context with in-memory DB */
  ctx: TestContext;
  /** The Express app instance */
  app: express.Application;
  /** The HTTP server instance */
  server: Server;
  /** Tool handler for direct access */
  tools: ToolHandler;
  /** Shutdown the server and cleanup */
  close: () => Promise<void>;
}

/**
 * Creates an isolated E2E test server.
 * 
 * GUARANTEES:
 * - Uses in-memory database (NEVER touches production data)
 * - Uses random high port (30000-40000)
 * - Completely isolated from any other server
 * 
 * @returns Promise resolving to the test server instance
 */
export async function createE2ETestServer(): Promise<E2ETestServer> {
  // GUARD: Verify we're in a test environment
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: E2E test harness cannot run in production mode');
  }

  // GUARD: Verify DB_PATH is NOT set to a file (paranoid check)
  if (process.env.DB_PATH && !process.env.DB_PATH.includes(':memory:')) {
    throw new Error(`FATAL: E2E test harness detected file-based DB_PATH: ${process.env.DB_PATH}`);
  }

  const port = getRandomTestPort();
  const baseUrl = `http://localhost:${port}`;

  // Create isolated test context (in-memory DB)
  const ctx = createTestContext();
  const { registry, queue } = ctx;
  const tools = new ToolHandler(registry, queue);

  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // Health endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: 'e2e-test', port });
  });

  // Mount routes (using test context's queue and db)
  const workspaceRoot = process.cwd();
  app.use('/admin', createTaskRoutes({ queue, workspaceRoot }));
  app.use('/admin', createReviewRoutes({ queue, db: ctx.db, workspaceRoot }));
  app.use('/admin', createAgentRoutes({ registry, queue }));

  // Stats and logs
  app.get('/admin/stats', (req, res) => res.json(queue.getStats()));
  app.get('/admin/logs', (req, res) => {
    try {
      res.json(queue.getLogs(100));
    } catch {
      res.json([]);
    }
  });

  // Tool Routing
  const VALID_TOOLS = [
    'register_agent', 'wait_for_prompt', 'send_response', 'assign_task',
    'list_agents', 'get_agent_status', 'ack_task', 'admin_update_agent',
    'wait_for_task', 'admin_evict_agent', 'get_task_context', 'block_task',
    'answer_task', 'update_progress', 'scaffold_plan', 'submit_review',
    'broadcast_system_prompt', 'get_review_comments', 'resolve_review_comment'
  ] as const;

  type ToolName = typeof VALID_TOOLS[number];

  app.post('/mcp/tools/:toolName', async (req, res) => {
    const { toolName } = req.params;
    const args = req.body;

    if (!VALID_TOOLS.includes(toolName as ToolName)) {
      res.status(404).json({ error: `Tool ${toolName} not found` });
      return;
    }

    const method = tools[toolName as keyof typeof tools];
    if (typeof method !== 'function') {
      res.status(500).json({ error: `Tool ${toolName} not implemented` });
      return;
    }

    try {
      const dbDependentTools = ['get_review_comments', 'resolve_review_comment'];
      const result = dbDependentTools.includes(toolName)
        ? await (method as any).call(tools, args, ctx.db)
        : await (method as any).call(tools, args);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // MCP JSON-RPC style endpoint
  app.post('/mcp', async (req, res) => {
    const { method, params } = req.body;
    if (method === 'tools/call') {
      const toolName = params.name;
      const toolMethod = tools[toolName as keyof typeof tools];
      if (typeof toolMethod === 'function') {
        try {
          const result = await (toolMethod as Function).call(tools, params.arguments);
          res.json({ result });
        } catch (e: any) {
          res.status(500).json({ error: e.message });
        }
      } else {
        res.status(404).json({ error: `Tool ${toolName} not found` });
      }
    } else {
      res.status(400).json({ error: 'Unknown method' });
    }
  });

  // Start server on random high port
  const server = await new Promise<Server>((resolve, reject) => {
    const srv = app.listen(port, () => {
      console.log(`[E2E] Test server started on port ${port} (in-memory DB)`);
      resolve(srv);
    });
    srv.on('error', reject);
  });

  return {
    baseUrl,
    port,
    ctx,
    app,
    server,
    tools,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      ctx.close();
      console.log(`[E2E] Test server on port ${port} shut down`);
    }
  };
}

/**
 * Vitest helper to setup/teardown E2E server for a test suite.
 * 
 * Usage:
 * ```typescript
 * const e2e = useE2EServer();
 * 
 * test('my e2e test', async () => {
 *   const { baseUrl, ctx } = e2e.getServer();
 *   const res = await fetch(`${baseUrl}/health`);
 *   expect(res.ok).toBe(true);
 * });
 * ```
 */
export function useE2EServer() {
  let server: E2ETestServer;

  return {
    async setup() {
      server = await createE2ETestServer();
    },
    async teardown() {
      await server?.close();
    },
    getServer() {
      if (!server) {
        throw new Error('E2E server not started. Call setup() in beforeAll()');
      }
      return server;
    }
  };
}
