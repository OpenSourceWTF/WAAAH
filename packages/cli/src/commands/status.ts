import { Command } from 'commander';
import {
  apiCall,
  handleError,
  parseMCPResponse,
  AgentInfo,
  formatAgentStatus,
  formatSingleAgentStatus
} from '../utils/index.js';

export const statusCommand = new Command('status')
  .description('Get status of agents (all if no agentId provided)')
  .argument('[agentId]', 'Specific agent ID to check')
  .action(async (agentId?: string) => {
    try {
      if (agentId) {
        const response = await apiCall<{ content?: { text?: string }[] }>('post', '/mcp/tools/get_agent_status', { agentId });
        const status = parseMCPResponse<AgentInfo>(response);
        if (status) {
          console.log(formatSingleAgentStatus(status));
        }
      } else {
        const agents = await apiCall<AgentInfo[]>('get', '/admin/agents/status');
        if (agents.length === 0) {
          console.log('No agents registered.');
        } else {
          console.log('Agent Status:');
          agents.forEach(a => console.log(`  ${formatAgentStatus(a)}`));
        }
      }
    } catch (error) {
      handleError(error);
    }
  });
