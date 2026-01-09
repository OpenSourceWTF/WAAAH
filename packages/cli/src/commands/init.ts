/**
 * waaah init - Initialize WAAAH project structure (S8)
 */
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const WAAAH_CONFIG_TEMPLATE = {
  name: '',
  version: '0.1.0',
  server: 'http://localhost:3456',
  workflows: '.agent/workflows'
};

const EXAMPLE_WORKFLOW = `---
description: Example agent workflow
name: example
---

## Overview
This is an example workflow template.

## Steps
1. Analyze the task
2. Plan implementation
3. Execute changes
4. Verify and test
5. Submit for review
`;

export const initCommand = new Command('init')
  .description('Initialize WAAAH project structure')
  .option('-t, --template <type>', 'Template type (minimal|standard)', 'minimal')
  .option('-n, --name <name>', 'Project name', path.basename(process.cwd()))
  .option('--force', 'Overwrite existing files')
  .action(async (options: {
    template: 'minimal' | 'standard';
    name: string;
    force?: boolean;
  }) => {
    const cwd = process.cwd();

    console.log(`🚀 Initializing WAAAH project: ${options.name}`);
    console.log(`   Template: ${options.template}`);

    // Create directories
    const dirs = [
      '.agent',
      '.agent/workflows',
      '.claude'
    ];

    for (const dir of dirs) {
      const dirPath = path.join(cwd, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`   Created: ${dir}/`);
      }
    }

    // Create waaah.json
    const configPath = path.join(cwd, 'waaah.json');
    if (!fs.existsSync(configPath) || options.force) {
      const config = { ...WAAAH_CONFIG_TEMPLATE, name: options.name };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`   Created: waaah.json`);
    } else {
      console.log(`   Skipped: waaah.json (exists)`);
    }

    // Create skills symlink
    const skillsPath = path.join(cwd, '.claude', 'skills');
    if (!fs.existsSync(skillsPath)) {
      try {
        fs.symlinkSync('../.agent/workflows', skillsPath);
        console.log(`   Created: .claude/skills -> ../.agent/workflows`);
      } catch (e) {
        console.log(`   Warning: Could not create symlink (may require admin)`);
      }
    }

    // Standard template adds more files
    if (options.template === 'standard') {
      // Create task.md
      const taskPath = path.join(cwd, '.agent', 'task.md');
      if (!fs.existsSync(taskPath) || options.force) {
        fs.writeFileSync(taskPath, '# Task List\n\n- [ ] Initial setup\n');
        console.log(`   Created: .agent/task.md`);
      }

      // Create example workflow
      const examplePath = path.join(cwd, '.agent', 'workflows', 'example-workflow.md');
      if (!fs.existsSync(examplePath) || options.force) {
        fs.writeFileSync(examplePath, EXAMPLE_WORKFLOW);
        console.log(`   Created: .agent/workflows/example-workflow.md`);
      }
    }

    console.log(`\n✅ WAAAH project initialized successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  1. Start the WAAAH server: waaah serve`);
    console.log(`  2. Run an agent: /waaah-orc`);
  });
