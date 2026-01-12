import { Command } from 'commander';
import { apiCall, handleError } from '../utils/index.js';

export const debugCommand = new Command('debug')
  .description('Show server debug state')
  .action(async () => {
    try {
      const data = await apiCall<{ agents: unknown[]; tasks: unknown[] }>('get', '/debug/state');
      console.log(JSON.stringify(data, null, 2));
    } catch (error) {
      handleError(error);
    }
  });
