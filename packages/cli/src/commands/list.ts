import { Command } from 'commander';
import { apiCall, handleError, parseMCPResponse, AgentInfo, formatAgentListItem } from '../utils/index.js';

export const listCommand = new Command('list-agents')
  .description('List all registered agents')
  .action(async () => {
    try {
      const response = await apiCall<any>('post', '/mcp/tools/list_agents', {});
      const agents = parseMCPResponse<AgentInfo[]>(response);
      if (agents) {
        agents.forEach(agent => console.log(formatAgentListItem(agent)));
      }
    } catch (error) {
      handleError(error);
    }
  });
