import { Command } from 'commander';
import axios from 'axios';
import chalk from 'chalk';

const SERVER_URL = process.env.WAAAH_SERVER_URL || 'http://localhost:3000';

export const restartCommand = new Command('restart')
  .description('Force an agent to restart (disconnect and reconnect)')
  .argument('<agentId>', 'The ID of the agent to restart')
  .option('-r, --reason <reason>', 'Reason for restart', 'Manual restart via CLI')
  .action(async (agentId, options) => {
    try {
      console.log(chalk.yellow(`Ordering restart for agent: ${agentId}...`));

      // Direct API call to the server endpoints
      // Since the CLI might not have direct DB access, we use the Admin API
      // But wait, the CLI packages usually communicate via HTTP to the MCP Server

      const res = await axios.post(`${SERVER_URL}/admin/agents/${agentId}/evict`, {
        reason: options.reason,
        action: 'RESTART'
      });

      if (res.status === 200) {
        console.log(chalk.green(`✅ Signal sent to ${agentId}.`));
        console.log(chalk.dim('Agent will restart upon next poll.'));
      } else {
        console.error(chalk.red(`Failed: ${res.statusText}`));
      }
    } catch (e: any) {
      console.error(chalk.red(`Error: ${e.response?.data?.error || e.message}`));
      process.exit(1);
    }
  });
