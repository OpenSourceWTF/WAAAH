import { Command } from 'commander';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { apiCall } from '../utils/index.js';

/**
 * Infers workspace context from the current directory.
 */
async function inferWorkspaceContext() {
  const cwd = process.cwd();

  let repoId: string;
  let remoteType: 'github' | 'local' = 'local';

  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8', cwd }).trim();
    // Normalize: git@github.com:org/repo.git → org/repo
    repoId = remoteUrl
      .replace(/^git@github\.com:/, '')
      .replace(/^https:\/\/github\.com\//, '')
      .replace(/\.git$/, '');
    remoteType = 'github';
  } catch {
    // No git remote, use package.json name or directory
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
      repoId = pkg.name || path.basename(cwd);
    } catch {
      repoId = path.basename(cwd);
    }
  }

  let branch = 'main';
  try {
    branch = execSync('git branch --show-current', { encoding: 'utf-8', cwd }).trim() || 'main';
  } catch { /* ignore */ }

  return {
    type: remoteType,
    repoId,
    branch,
    path: cwd
  };
}

/**
 * Parses a tasks.md file to extract task structure.
 */
function parseTasksFile(content: string): { tasks: any[], parallelizable: boolean } {
  const tasks: any[] = [];
  const lines = content.split('\n');
  let currentTask: any = null;

  for (const line of lines) {
    // Match task headers like "### T1: Task Name"
    const taskMatch = line.match(/^###?\s+T(\d+):\s+(.+)/);
    if (taskMatch) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {
        id: `T${taskMatch[1]}`,
        name: taskMatch[2].trim(),
        dependencies: [],
        content: line + '\n'
      };
      continue;
    }

    // Match dependencies
    const depMatch = line.match(/\*\*Dependencies\*\*:\s*(.+)/i);
    if (depMatch && currentTask) {
      const deps = depMatch[1].match(/T\d+/g) || [];
      currentTask.dependencies = deps.filter(d => d !== 'None');
    }

    if (currentTask) {
      currentTask.content += line + '\n';
    }
  }

  if (currentTask) tasks.push(currentTask);

  // Determine if parallelizable: any tasks with no dependencies?
  const independentTasks = tasks.filter(t => t.dependencies.length === 0);
  const parallelizable = independentTasks.length >= 2;

  return { tasks, parallelizable };
}

export const assignCommand = new Command('assign')
  .description('Assign a task to an orchestrator agent with optional spec')
  .argument('[prompt]', 'Task prompt (optional if --spec provided)')
  .option('-s, --spec <path>', 'Path to spec/tasks file')
  .option('-p, --parallel', 'Force parallel mode (submit multiple tasks)')
  .option('--single', 'Force single-agent mode (submit one task)')
  .action(async (prompt: string | undefined, options: { spec?: string; parallel?: boolean; single?: boolean }) => {
    try {
      // 1. Infer workspace context
      const workspace = await inferWorkspaceContext();
      console.log(`📁 Workspace: ${workspace.repoId} (${workspace.branch})`);

      // 2. Load spec if provided
      let specContent: string | undefined;
      let tasks: any[] = [];
      let useParallel = false;

      if (options.spec) {
        const specPath = path.resolve(options.spec);
        if (!fs.existsSync(specPath)) {
          console.error(`❌ Spec file not found: ${specPath}`);
          process.exit(1);
        }
        specContent = fs.readFileSync(specPath, 'utf-8');

        const parsed = parseTasksFile(specContent);
        tasks = parsed.tasks;
        useParallel = options.parallel || (!options.single && parsed.parallelizable);

        console.log(`📋 Spec loaded: ${tasks.length} tasks found`);
        console.log(`🔀 Mode: ${useParallel ? 'PARALLEL' : 'SINGLE-AGENT'}`);
      }

      // 3. Validate we have something to do
      if (!prompt && !specContent) {
        console.error('❌ Please provide a prompt or --spec file');
        process.exit(1);
      }

      // 4. Submit task(s)
      if (useParallel && tasks.length > 0) {
        // Parallel mode: submit independent tasks first
        const independentTasks = tasks.filter(t => t.dependencies.length === 0);
        console.log(`\n🚀 Submitting ${independentTasks.length} parallel tasks...`);

        for (const task of independentTasks) {
          const result = await apiCall<any>('post', '/mcp/tools/assign_task', {
            targetAgentId: 'orchestrator',
            sourceAgentId: 'boss',
            prompt: task.name,
            spec: { 'tasks.md': task.content },
            context: {
              workspace,
              git: { branch: workspace.branch }
            }
          });
          console.log(`  ✅ Submitted: ${task.id} - ${task.name} → Task ID: ${result?.taskId || 'unknown'}`);
        }
      } else {
        // Single-agent mode
        const result = await apiCall<any>('post', '/mcp/tools/assign_task', {
          targetAgentId: 'orchestrator',
          sourceAgentId: 'boss',
          prompt: prompt || 'Execute the provided spec',
          spec: specContent ? { 'tasks.md': specContent } : undefined,
          context: {
            workspace,
            git: { branch: workspace.branch }
          }
        });
        console.log(`✅ Task submitted: ${result?.taskId || 'unknown'}`);
      }

    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  });
