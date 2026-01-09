/**
 * Test harness for isolated database testing.
 * Uses the new ServerContext architecture for complete isolation.
 */
import { beforeEach, afterEach } from 'vitest';
import { createTestContext, type ServerContext } from '../src/state/context.js';

// Re-export ServerContext as TestContext for backward compatibility
export type TestContext = ServerContext;

/**
 * Creates an isolated test context with in-memory database.
 * Uses the new factory pattern - ALWAYS safe, NEVER touches production data.
 */
export function createTestContext_(): TestContext {
  return createTestContext();
}

// Re-export for direct import
export { createTestContext };

/**
 * Helper to setup/teardown test context in describe blocks.
 */
export function useTestContext(): { getContext: () => TestContext } {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    ctx?.close();
  });

  return {
    getContext: () => ctx
  };
}
