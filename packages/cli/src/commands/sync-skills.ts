/**
 * sync-skills command - Bidirectional symlink sync between workflows and skills
 * 
 * Detects real files in either .agent/workflows/ or .claude/skills/
 * and creates symlinks in the other location. Ignores existing symlinks.
 * 
 * @packageDocumentation
 */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { findWorkspaceRoot } from '../utils/workspace.js';

interface SyncResult {
  created: string[];
  skipped: string[];
  removed: string[];
  errors: string[];
}

export const syncSkillsCommand = new Command('sync-skills')
  .description('Sync workflows ↔ Claude skills (bidirectional symlinks)')
  .option('--no-clean', 'Do NOT remove orphaned symlinks')
  .option('--regenerate', 'Remove all symlinks and recreate them fresh')
  .action(async (options: { clean?: boolean; regenerate?: boolean }) => {
    // Default clean to true unless --no-clean passed
    const shouldClean = options.clean !== false;
    const cwd = process.cwd();
    let workspaceRoot: string;

    try {
      workspaceRoot = await findWorkspaceRoot(cwd);
    } catch {
      console.error('❌ Could not find workspace root (git repository)');
      process.exit(1);
    }

    const workflowsDir = path.join(workspaceRoot, '.agent', 'workflows');
    const skillsDir = path.join(workspaceRoot, '.claude', 'skills');

    console.log(`📂 Workspace: ${workspaceRoot}\n`);

    // Ensure both directories exist
    await fs.mkdir(workflowsDir, { recursive: true });
    await fs.mkdir(skillsDir, { recursive: true });

    const result: SyncResult = { created: [], skipped: [], removed: [], errors: [] };

    /**
     * Helper to check if a symlink is orphaned
     */
    async function isOrphaned(filePath: string): Promise<boolean> {
      try {
        const stat = await fs.lstat(filePath);
        if (!stat.isSymbolicLink()) return false;

        const target = await fs.readlink(filePath);
        const absoluteTarget = path.isAbsolute(target)
          ? target
          : path.resolve(path.dirname(filePath), target);

        try {
          await fs.access(absoluteTarget);
          return false;
        } catch {
          return true;
        }
      } catch {
        return false;
      }
    }

    // 0. Cleanup / Regenerate Phase
    if (options.regenerate || shouldClean) {
      // 0a. Clean workflows dir (*.md)
      try {
        const files = await fs.readdir(workflowsDir);
        for (const file of files) {
          const fullPath = path.join(workflowsDir, file);
          const stat = await fs.lstat(fullPath);
          if (stat.isSymbolicLink()) {
            if (options.regenerate || (shouldClean && await isOrphaned(fullPath))) {
              await fs.unlink(fullPath);
              result.removed.push(path.relative(workspaceRoot, fullPath));
            }
          }
        }
      } catch (err) { /* ignore readdir errors */ }

      // 0b. Clean skills dir (*/SKILL.md)
      try {
        const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true });
        for (const entry of skillEntries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(skillsDir, entry.name, 'SKILL.md');
            try {
              const stat = await fs.lstat(skillPath);
              if (stat.isSymbolicLink()) {
                if (options.regenerate || (shouldClean && await isOrphaned(skillPath))) {
                  await fs.unlink(skillPath);
                  result.removed.push(path.relative(workspaceRoot, skillPath));
                }
              }
            } catch { /* SKILL.md might not exist */ }
          }
        }
      } catch (err) { /* ignore readdir errors */ }
    }

    // 1. Scan workflows → create skill symlinks
    try {
      const files = await fs.readdir(workflowsDir);
      for (const file of files.filter(f => f.endsWith('.md'))) {
        const name = file.replace('.md', '');
        const workflowPath = path.join(workflowsDir, file);
        const skillDir = path.join(skillsDir, name);
        const skillPath = path.join(skillDir, 'SKILL.md');

        // Skip if workflow is itself a symlink
        const stat = await fs.lstat(workflowPath);
        if (stat.isSymbolicLink()) {
          result.skipped.push(`${name} (workflow is symlink)`);
          continue;
        }

        // Check if skill already exists
        try {
          await fs.access(skillPath);
          const skillStat = await fs.lstat(skillPath);
          if (skillStat.isSymbolicLink()) {
            result.skipped.push(`${name} (skill symlink exists)`);
          } else {
            result.skipped.push(`${name} (skill is real file)`);
          }
          continue;
        } catch {
          // Skill doesn't exist, create symlink
        }

        try {
          await fs.mkdir(skillDir, { recursive: true });
          const relPath = path.relative(skillDir, workflowPath);
          await fs.symlink(relPath, skillPath);
          result.created.push(`${name} (workflow → skill)`);
        } catch (err) {
          result.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch {
      // Workflows dir doesn't exist or is empty
    }

    // 2. Scan skills → create workflow symlinks
    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      for (const entry of entries.filter(e => e.isDirectory())) {
        const name = entry.name;
        const skillPath = path.join(skillsDir, name, 'SKILL.md');
        const workflowPath = path.join(workflowsDir, `${name}.md`);

        // Check if skill file exists
        try {
          await fs.access(skillPath);
        } catch {
          result.skipped.push(`${name} (no SKILL.md)`);
          continue;
        }

        // Skip if skill is a symlink (already synced from workflow)
        const skillStat = await fs.lstat(skillPath);
        if (skillStat.isSymbolicLink()) {
          // Already handled above
          continue;
        }

        // Check if workflow already exists
        try {
          await fs.access(workflowPath);
          const wfStat = await fs.lstat(workflowPath);
          if (wfStat.isSymbolicLink()) {
            result.skipped.push(`${name} (workflow symlink exists)`);
          } else {
            result.skipped.push(`${name} (workflow is real file)`);
          }
          continue;
        } catch {
          // Workflow doesn't exist, create symlink
        }

        try {
          const relPath = path.relative(workflowsDir, skillPath);
          await fs.symlink(relPath, workflowPath);
          result.created.push(`${name} (skill → workflow)`);
        } catch (err) {
          result.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch {
      // Skills dir doesn't exist or is empty
    }

    // Report
    if (result.removed.length > 0) {
      console.log('🗑️  Removed symlinks:');
      result.removed.forEach(s => console.log(`   ${s}`));
    }
    if (result.created.length > 0) {
      console.log('✅ Created symlinks:');
      result.created.forEach(s => console.log(`   ${s}`));
    }
    if (result.skipped.length > 0 && !options.regenerate) {
      console.log('⏭️  Skipped:');
      result.skipped.forEach(s => console.log(`   ${s}`));
    }
    if (result.errors.length > 0) {
      console.log('❌ Errors:');
      result.errors.forEach(s => console.log(`   ${s}`));
    }

    if (result.created.length === 0 && result.removed.length === 0 && result.errors.length === 0) {
      console.log('✅ Already in sync!');
    }
  });
