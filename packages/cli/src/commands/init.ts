import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

export const initCommand = new Command('init')
  .description('Initialize a new WAAAH workspace')
  .argument('[path]', 'Project path', '.')
  .option('-t, --template <template>', 'Template to use (minimal, standard)', 'minimal')
  .action(async (targetPath: string, options: { template: string }) => {
    const cwd = process.cwd();
    const projectRoot = path.resolve(cwd, targetPath);
    const projectName = path.basename(projectRoot);

    console.log(`🚀 Initializing WAAAH workspace in ${projectRoot}...`);

    // 1. Create directory
    if (!fs.existsSync(projectRoot)) {
      fs.mkdirSync(projectRoot, { recursive: true });
      console.log(`   Created directory: ${projectRoot}`);
    }

    // 2. Create waaah.json
    const configPath = path.join(projectRoot, 'waaah.json');
    if (!fs.existsSync(configPath)) {
      const config = {
        project: projectName,
        waaah: {
          version: '1.0',
          server: 'http://localhost:3000'
        }
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('   Created waaah.json');
    } else {
      console.log('   waaah.json already exists, skipping.');
    }

    // 3. Create .agent/workflows directory
    const workflowsDir = path.join(projectRoot, '.agent', 'workflows');
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
      console.log('   Created .agent/workflows directory');
    }

    // 4. Create initial task.md if standard
    if (options.template === 'standard') {
      const taskPath = path.join(projectRoot, '.agent', 'task.md');
      if (!fs.existsSync(taskPath)) {
        const taskContent = `# ${projectName} Tasks\n\n- [ ] Initial Setup\n`;
        fs.writeFileSync(taskPath, taskContent);
        console.log('   Created .agent/task.md');
      }

      const workflowPath = path.join(workflowsDir, 'example-workflow.md');
      if (!fs.existsSync(workflowPath)) {
        const workflowContent = `---
description: Example workflow
---
# Example Workflow

1. Echo "Hello World"
`;
        fs.writeFileSync(workflowPath, workflowContent);
        console.log('   Created example workflow');
      }
    }

    console.log('\n✅ WAAAH workspace initialized!');
    console.log('   To start, run: waaah help');
  });
