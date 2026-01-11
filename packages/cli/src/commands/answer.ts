import { Command } from 'commander';
import { apiCall, handleError } from '../utils/index.js';

export const answerCommand = new Command('answer')
  .description('Provide an answer to a blocked task')
  .argument('<taskId>', 'The ID of the blocked task')
  .argument('<answer...>', 'The answer to the blocker')
  .action(async (taskId: string, answerParts: string[]) => {
    const answer = answerParts.join(' ');
    try {
      const response = await apiCall<any>('post', '/mcp/tools/answer_task', {
        taskId,
        answer
      });
      // The tool returns content array
      const text = response.content?.[0]?.text || 'Answer recorded.';
      console.log(`✅ ${text}`);
    } catch (error) {
      handleError(error);
    }
  });
