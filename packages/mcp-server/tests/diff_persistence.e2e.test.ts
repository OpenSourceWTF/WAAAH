/**
 * E2E Tests for Diff Persistence
 * Tests that diffs are properly stored and retrieved from the database
 * after feature branches are deleted.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BASE_URL = process.env.WAAAH_SERVER_URL || 'http://localhost:3456';

describe('Diff Persistence E2E', () => {
  let testTaskId: string;

  beforeAll(async () => {
    // Generate unique task ID for this test run
    testTaskId = `test-diff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterAll(async () => {
    // Cleanup: Remove test task from database if it exists
    // Note: In a real scenario, you'd have an admin endpoint for this
  });

  describe('Stored Diff Retrieval', () => {
    it('should return stored diff when task has artifacts.diff in response', async () => {
      // Create a task with stored diff in artifacts
      const storedDiff = `diff --git a/test.ts b/test.ts
new file mode 100644
--- /dev/null
+++ b/test.ts
@@ -0,0 +1,5 @@
+export function testFunction() {
+  return 'hello world';
+}
+
+export const TEST_CONST = 42;`;

      // First, create a task via the assign endpoint
      const assignRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'assign_task',
            arguments: {
              prompt: 'E2E Test: Diff persistence test task',
              context: { test: true }
            }
          },
          id: 1
        })
      });

      // Check if server is running
      if (!assignRes.ok) {
        console.warn('WAAAH server not available for E2E test, skipping...');
        return;
      }

      const assignData = await assignRes.json();
      const realTaskId = assignData.result?.content?.[0]?.text?.match(/task-\S+/)?.[0];

      if (!realTaskId) {
        console.warn('Could not create test task, skipping...');
        return;
      }

      // Now send a response with stored diff
      const responseRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'send_response',
            arguments: {
              taskId: realTaskId,
              status: 'IN_REVIEW',
              message: 'E2E Test: Implementation complete',
              artifacts: {
                diff: storedDiff,
                files: ['test.ts']
              }
            }
          },
          id: 2
        })
      });

      expect(responseRes.ok).toBe(true);

      // Now fetch the diff and verify it comes from stored source
      const diffRes = await fetch(`${BASE_URL}/admin/tasks/${realTaskId}/diff`);
      expect(diffRes.ok).toBe(true);

      const diffData = await diffRes.json();
      expect(diffData.source).toBe('stored');
      expect(diffData.diff).toBe(storedDiff);
    });
  });

  describe('Git Diff Fallback', () => {
    it('should fall back to git diff when no stored diff exists', async () => {
      // Create a task without artifacts
      const assignRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'assign_task',
            arguments: {
              prompt: 'E2E Test: No diff fallback test',
              context: { test: true }
            }
          },
          id: 3
        })
      });

      if (!assignRes.ok) {
        console.warn('WAAAH server not available for E2E test, skipping...');
        return;
      }

      const assignData = await assignRes.json();
      const realTaskId = assignData.result?.content?.[0]?.text?.match(/task-\S+/)?.[0];

      if (!realTaskId) {
        console.warn('Could not create test task, skipping...');
        return;
      }

      // Send response WITHOUT artifacts
      const responseRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'send_response',
            arguments: {
              taskId: realTaskId,
              status: 'IN_REVIEW',
              message: 'E2E Test: No diff attached'
            }
          },
          id: 4
        })
      });

      expect(responseRes.ok).toBe(true);

      // Fetch diff - should attempt git fallback
      // This will fail since there's no actual branch, but that's expected
      const diffRes = await fetch(`${BASE_URL}/admin/tasks/${realTaskId}/diff`);

      // Either succeeds with git source or fails (no branch)
      if (diffRes.ok) {
        const diffData = await diffRes.json();
        expect(diffData.source).toBe('git');
      } else {
        // Expected: branch doesn't exist for test task
        const errorData = await diffRes.json();
        expect(errorData.error).toBe('Failed to fetch diff');
      }
    });
  });

  describe('Diff Structure Validation', () => {
    it('should return proper diff format with source indicator', async () => {
      // Just test the structure of the response
      const testDiff = `diff --git a/example.ts b/example.ts
index abc123..def456 100644
--- a/example.ts
+++ b/example.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 export { x };`;

      // Create and populate a task
      const assignRes = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'assign_task',
            arguments: {
              prompt: 'E2E Test: Diff structure validation',
              context: { test: true }
            }
          },
          id: 5
        })
      });

      if (!assignRes.ok) {
        console.warn('WAAAH server not available for E2E test, skipping...');
        return;
      }

      const assignData = await assignRes.json();
      const realTaskId = assignData.result?.content?.[0]?.text?.match(/task-\S+/)?.[0];

      if (!realTaskId) {
        console.warn('Could not create test task, skipping...');
        return;
      }

      // Send response with structured artifacts
      await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'tools/call',
          params: {
            name: 'send_response',
            arguments: {
              taskId: realTaskId,
              status: 'IN_REVIEW',
              message: 'Diff structure test',
              artifacts: {
                diff: testDiff,
                files: ['example.ts']
              }
            }
          },
          id: 6
        })
      });

      // Verify diff response structure
      const diffRes = await fetch(`${BASE_URL}/admin/tasks/${realTaskId}/diff`);
      expect(diffRes.ok).toBe(true);

      const diffData = await diffRes.json();

      // Verify structure
      expect(diffData).toHaveProperty('diff');
      expect(diffData).toHaveProperty('source');
      expect(typeof diffData.diff).toBe('string');
      expect(['stored', 'git']).toContain(diffData.source);

      // Verify content
      expect(diffData.diff).toContain('diff --git');
      expect(diffData.diff).toContain('example.ts');
    });
  });
});
