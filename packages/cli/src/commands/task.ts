/**
 * waaah task - Task status summary command (S10)
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { apiCall, handleError } from '../utils/index.js';

interface TaskSummary {
  id: string;
  status: string;
  prompt: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  progress?: {
    message?: string;
    percentage?: number;
  };
}

/**
 * Format time ago string from timestamp or ISO string
 */
function timeAgo(dateInput: string | number): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : new Date(dateInput);
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

/**
 * Get status color
 */
function statusColor(status: string): (text: string) => string {
  switch (status) {
    case 'COMPLETED': return chalk.green;
    case 'FAILED': return chalk.red;
    case 'BLOCKED': return chalk.yellow;
    case 'IN_PROGRESS': return chalk.blue;
    case 'IN_REVIEW': return chalk.magenta;
    case 'QUEUED': return chalk.gray;
    case 'PENDING_ACK': return chalk.cyan;
    default: return chalk.white;
  }
}

/**
 * Truncate prompt for display
 */
function truncate(text: string, maxLen: number): string {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen - 3) + '...';
}

export const taskCommand = new Command('task')
  .description('Show task status summary')
  .argument('[taskId]', 'Task ID for detailed view')
  .option('--running', 'Show only running tasks')
  .option('--completed', 'Show only completed tasks')
  .option('--all', 'Show all tasks including completed')
  .option('-n, --limit <number>', 'Limit results', '20')
  .action(async (taskId: string | undefined, options: {
    running?: boolean;
    completed?: boolean;
    all?: boolean;
    limit: string;
  }) => {
    try {
      if (taskId) {
        // Detail view for single task
        const task = await apiCall<TaskSummary>('get', `/admin/tasks/${taskId}`);
        console.log();
        console.log(chalk.bold(`Task: ${task.id}`));
        console.log(`Status: ${statusColor(task.status)(task.status)}`);
        console.log(`Assigned: ${task.assignedTo || 'Unassigned'}`);
        console.log(`Created: ${timeAgo(task.createdAt)}`);
        console.log(`Updated: ${timeAgo(task.updatedAt)}`);
        if (task.progress?.message) {
          console.log(`Progress: ${task.progress.message}`);
        }
        console.log();
        console.log(chalk.dim('Prompt:'));
        console.log(task.prompt);
        return;
      }

      // List view
      let filter = '';
      if (options.running) filter = '?status=IN_PROGRESS';
      else if (options.completed) filter = '?status=COMPLETED';

      const limit = parseInt(options.limit, 10) || 20;
      const tasks = await apiCall<TaskSummary[]>('get', `/admin/tasks${filter}&limit=${limit}`);

      if (tasks.length === 0) {
        console.log(chalk.gray('No tasks found.'));
        return;
      }

      // Sort by updatedAt descending
      tasks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      // Cap at 50
      const display = tasks.slice(0, 50);

      console.log();
      console.log(chalk.bold(`Tasks (${display.length}/${tasks.length}):`));
      console.log(chalk.dim('─'.repeat(80)));

      for (const task of display) {
        const status = statusColor(task.status)(task.status.padEnd(12));
        const agent = (task.assignedTo || 'unassigned').substring(0, 12).padEnd(12);
        const time = timeAgo(task.updatedAt).padEnd(8);
        const prompt = truncate(task.prompt, 40);

        console.log(`${status} ${chalk.cyan(agent)} ${chalk.dim(time)} ${prompt}`);
      }

      console.log(chalk.dim('─'.repeat(80)));
      console.log(chalk.dim(`Use 'waaah task <id>' for details`));

    } catch (error) {
      handleError(error);
    }
  });
