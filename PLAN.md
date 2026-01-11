# Refactor Plan: mcp-server state

## Task
Refactor `packages/mcp-server/src/state` to improve code quality.
Violations:
- `queue.ts`: Size 648 (limit 500), Complexity 72 (limit 20), Stubs 16.
- `queue-persistence.ts`: Stubs 8.
- `agent-matching-service.ts`: Stubs 2.

## Criteria
1. `queue.ts` size < 500 lines.
2. `queue.ts` complexity < 20.
3. `queue.ts` stubs = 0.
4. `queue-persistence.ts` stubs = 0.
5. `agent-matching-service.ts` stubs = 0.
6. All tests pass.

## Steps
1. Analyze `queue.ts` logic and identify extraction candidates.
2. Analyze stubs in all 3 files.
3. Implement or remove stubs in `agent-matching-service.ts`.
4. Implement or remove stubs in `queue-persistence.ts`.
5. Extract logic from `queue.ts` to new/existing services.
6. Fix stubs in `queue.ts`.
7. Verify metrics and tests.
