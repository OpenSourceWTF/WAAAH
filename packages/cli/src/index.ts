#!/usr/bin/env node
import { Command } from 'commander';
import { ensureServerRunning } from './utils/index.js';
import { interactiveMode } from './interactive.js';
import { restartCommand } from './commands/restart.js';
import { assignCommand } from './commands/assign.js';
import { initCommand } from './commands/init.js';
import { taskCommand } from './commands/task.js';
import { agentCommand } from './commands/agent.js';
import { syncSkillsCommand } from './commands/sync-skills.js';
import { sendCommand } from './commands/send.js';
import { answerCommand } from './commands/answer.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';
import { debugCommand } from './commands/debug.js';

const program = new Command();

program
  .name('waaah')
  .description('WAAAH MCP CLI')
  .version('0.0.1');

program.addCommand(restartCommand);
program.addCommand(assignCommand);
program.addCommand(initCommand);
program.addCommand(taskCommand);
program.addCommand(agentCommand);
program.addCommand(syncSkillsCommand);
program.addCommand(sendCommand);
program.addCommand(answerCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(debugCommand);

if (process.argv.length <= 2) {
  ensureServerRunning().then(() => interactiveMode());
} else {
  ensureServerRunning().then(() => program.parse());
}
