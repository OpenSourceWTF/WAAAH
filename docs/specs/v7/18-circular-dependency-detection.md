# S18: Circular Dependency Detection

## Context
When creating multiple tasks with dependencies (e.g., via `waaah assign tasks.md`), circular dependencies (A→B→A) can cause deadlocks where no task ever becomes eligible.

## Relationship to ARCHITECTURE.md
Per **Section 3.3 (Task Dependencies)**:
> **Circular Dependency Detection**: The CLI (`waaah assign`) MUST detect and reject circular dependencies (A→B→A) before creating tasks.

## Requirements

### CLI Validation (`waaah assign`)
1. **Parse Dependencies**: When parsing `tasks.md`, build a dependency graph.
2. **Detect Cycles**: Use topological sort or DFS to detect cycles.
3. **Reject on Cycle**: If a cycle is detected, abort the entire assignment with clear error message showing the cycle path.

### Algorithm
```typescript
function detectCycle(tasks: { id: string; dependencies: string[] }[]): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(taskId: string): boolean {
    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = tasks.find(t => t.id === taskId);
    for (const depId of task?.dependencies || []) {
      if (!visited.has(depId)) {
        if (dfs(depId)) return true;
      } else if (recursionStack.has(depId)) {
        path.push(depId); // Complete the cycle
        return true;
      }
    }

    path.pop();
    recursionStack.delete(taskId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id) && dfs(task.id)) {
      // Return cycle path
      const cycleStart = path[path.length - 1];
      const cycleStartIndex = path.indexOf(cycleStart);
      return path.slice(cycleStartIndex);
    }
  }
  return null;
}
```

### Error Message Format
```
Error: Circular dependency detected: TaskA → TaskB → TaskC → TaskA
Cannot create tasks. Please resolve the dependency cycle.
```

## Verification
- [ ] `waaah assign` detects simple cycles (A→B→A)
- [ ] `waaah assign` detects complex cycles (A→B→C→A)
- [ ] Clear error message with cycle path is displayed
- [ ] No tasks are created if cycle is detected

## Status
TODO
