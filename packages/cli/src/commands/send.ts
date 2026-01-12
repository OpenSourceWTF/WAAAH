import { Command } from 'commander';
import { apiCall, handleError } from '../utils/index.js';

export const sendCommand = new Command('send')
  .description('Send a task to a specific agent or role')
  .argument('<target>', 'Target agent ID or role')
  .argument('<prompt...>', 'Task prompt')
  .option('-p, --priority <priority>', 'Task priority (normal|high|critical)', 'normal')
  .option('--wait', 'Wait for response (blocks until completion)', false)
  .action(async (target: string, promptParts: string[], options: { priority: string, wait: boolean }) => {
    const prompt = promptParts.join(' ');
    try {
      const response = await apiCall<{ taskId: string }>('post', '/admin/enqueue', {
        prompt,
        agentId: target,
        priority: options.priority
      });
      console.log(`✅ Task enqueued: ${response.taskId}`);
      if (options.wait) {
        await pollTaskResponse(response.taskId);
      }
    } catch (error) {
      handleError(error);
    }
  });

async function pollTaskResponse(taskId: string) {
  const start = Date.now();
  const timeout = 60000;
  while (Date.now() - start < timeout) {
    try {
      const task = await apiCall<{ status: string; response?: { message?: string } }>('get', `/admin/tasks/${taskId}`);
      if (['COMPLETED', 'FAILED', 'BLOCKED'].includes(task.status)) {
        console.log(`\nResult for ${taskId}: ${task.status}`);
        console.log(`   ${task.response?.message}`);
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    } catch { break; }
  }
}
