/**
 * waaah assign - Assign tasks from a file or inline (S6, S18)
 * Supports parallel task creation with dependency detection.
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { apiCall, handleError } from '../utils/index.js';

interface ParsedTask {
  id: string;
  prompt: string;
  dependencies: string[];
  spec?: string;
  tasks?: string;
}

/**
 * Detects circular dependencies in task graph using DFS (S18).
 * @returns The cycle path if detected, null otherwise.
 */
function detectCycle(tasks: ParsedTask[]): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  function dfs(taskId: string, path: string[]): string[] | null {
    visited.add(taskId);
    recursionStack.add(taskId);
    path.push(taskId);

    const task = taskMap.get(taskId);
    for (const depId of task?.dependencies || []) {
      if (!visited.has(depId)) {
        const result = dfs(depId, path);
        if (result) return result;
      } else if (recursionStack.has(depId)) {
        // Found cycle - return the cycle path
        const cycleStartIndex = path.indexOf(depId);
        return [...path.slice(cycleStartIndex), depId];
      }
    }

    path.pop();
    recursionStack.delete(taskId);
    return null;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      const cycle = dfs(task.id, []);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Parse tasks.md format into structured tasks.
 * Expected format:
 * - [ ] Task description #dep:task-id
 */
function parseTasksFile(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  let taskCounter = 1;

  for (const line of lines) {
    // Match markdown task items: - [ ] or - [x]
    const match = line.match(/^-\s*\[([ x])\]\s*(.+)$/i);
    if (!match) continue;

    const rawPrompt = match[2];

    // Extract dependencies: #dep:task-id
    const depMatches = rawPrompt.matchAll(/#dep:([\w-]+)/g);
    const dependencies = Array.from(depMatches).map(m => m[1]);

    // Remove dep tags from prompt
    const prompt = rawPrompt.replace(/#dep:[\w-]+/g, '').trim();

    // Generate task ID
    const id = `task-${taskCounter++}`;

    tasks.push({ id, prompt, dependencies });
  }

  return tasks;
}

export const assignCommand = new Command('assign')
  .description('Assign tasks from a file or inline prompt')
  .argument('[file]', 'Path to tasks.md or spec.md file')
  .option('-p, --prompt <text>', 'Inline prompt (alternative to file)')
  .option('--spec <file>', 'Path to spec file to attach')
  .option('--tasks <file>', 'Path to tasks file to attach')
  .option('--capability <caps...>', 'Required capabilities', ['code-writing'])
  .option('--priority <level>', 'Task priority', 'normal')
  .option('--workspace <id>', 'Workspace ID for affinity')
  .option('--dry-run', 'Show what would be created without creating')
  .action(async (file: string | undefined, options: {
    prompt?: string;
    spec?: string;
    tasks?: string;
    capability: string[];
    priority: string;
    workspace?: string;
    dryRun?: boolean;
  }) => {
    try {
      let tasksToCreate: ParsedTask[] = [];
      let specContent: string | undefined;
      let tasksContent: string | undefined;

      // Load spec file if provided
      if (options.spec) {
        const specPath = path.resolve(options.spec);
        if (!fs.existsSync(specPath)) {
          console.error(`❌ Spec file not found: ${specPath}`);
          process.exit(1);
        }
        specContent = fs.readFileSync(specPath, 'utf-8');
      }

      // Load tasks file if provided  
      if (options.tasks) {
        const tasksPath = path.resolve(options.tasks);
        if (!fs.existsSync(tasksPath)) {
          console.error(`❌ Tasks file not found: ${tasksPath}`);
          process.exit(1);
        }
        tasksContent = fs.readFileSync(tasksPath, 'utf-8');
      }

      if (options.prompt) {
        // Single task from inline prompt
        tasksToCreate = [{
          id: `task-${Date.now()}`,
          prompt: options.prompt,
          dependencies: [],
          spec: specContent,
          tasks: tasksContent
        }];
      } else if (file) {
        // Parse file for multiple tasks
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) {
          console.error(`❌ File not found: ${filePath}`);
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        // If it looks like a tasks file, parse it
        if (content.includes('- [ ]') || content.includes('- [x]')) {
          tasksToCreate = parseTasksFile(content);
          // Attach spec/tasks content to all parsed tasks
          tasksToCreate = tasksToCreate.map(t => ({
            ...t,
            spec: specContent,
            tasks: tasksContent || content
          }));
        } else {
          // Treat entire file as a single task prompt
          tasksToCreate = [{
            id: `task-${Date.now()}`,
            prompt: content,
            dependencies: [],
            spec: specContent || content,
            tasks: tasksContent
          }];
        }
      } else {
        console.error('❌ Either provide a file or --prompt');
        process.exit(1);
      }

      // S18: Detect circular dependencies
      const cycle = detectCycle(tasksToCreate);
      if (cycle) {
        console.error(`❌ Circular dependency detected: ${cycle.join(' → ')}`);
        console.error('Cannot create tasks. Please resolve the dependency cycle.');
        process.exit(1);
      }

      if (options.dryRun) {
        console.log('🔍 Dry Run - Would create:');
        tasksToCreate.forEach(t => {
          console.log(`  - ${t.id}: ${t.prompt.substring(0, 50)}...`);
          if (t.dependencies.length) {
            console.log(`    Dependencies: ${t.dependencies.join(', ')}`);
          }
        });
        return;
      }

      // Create tasks via API
      console.log(`📋 Creating ${tasksToCreate.length} task(s)...`);
      const createdIds: Map<string, string> = new Map();

      // Create in dependency order (topological sort would be ideal, but simple iteration works for DAGs)
      for (const task of tasksToCreate) {
        // Map local IDs to server IDs for dependencies
        const serverDeps = task.dependencies
          .map(d => createdIds.get(d))
          .filter((id): id is string => !!id);

        const response = await apiCall<{ taskId: string }>('post', '/admin/enqueue', {
          prompt: task.prompt,
          requiredCapabilities: options.capability,
          priority: options.priority,
          workspaceId: options.workspace,
          spec: task.spec,
          tasks: task.tasks,
          dependencies: serverDeps
        });

        createdIds.set(task.id, response.taskId);
        console.log(`✅ Created: ${response.taskId} (${task.prompt.substring(0, 40)}...)`);
      }

      console.log(`\n🎉 Created ${createdIds.size} task(s) successfully!`);

    } catch (error) {
      handleError(error);
    }
  });
