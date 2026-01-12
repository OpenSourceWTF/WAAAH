/**
 * sync-skills command - Bidirectional symlink sync between workflows and skills
 * 
 * Syncs .agent/workflows/ to BOTH:
 *   - .claude/skills/[skillname]/SKILL.md (for Claude Code)
 *   - .gemini/skills/[skillname]/SKILL.md (for Gemini CLI)
 * 
 * Also syncs back from skills dirs to workflows if real files exist there.
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

// Skill directory configurations
const SKILL_DIRS = [
  { name: 'claude', dir: '.claude/skills' },
  { name: 'gemini', dir: '.gemini/skills' }
];

export const syncSkillsCommand = new Command('sync-skills')
  .description('Sync workflows ↔ Claude + Gemini skills (bidirectional symlinks)')
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

    console.log(`📂 Workspace: ${workspaceRoot}\n`);

    // Ensure workflows directory exists
    await fs.mkdir(workflowsDir, { recursive: true });

    // Ensure all skills directories exist
    for (const skillConfig of SKILL_DIRS) {
      const skillsDir = path.join(workspaceRoot, skillConfig.dir);
      await fs.mkdir(skillsDir, { recursive: true });
    }

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

    /**
     * Clean symlinks in a skills directory
     */
    async function cleanSkillsDir(skillsDir: string, skillName: string): Promise<void> {
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
                  result.removed.push(`${skillName}: ${path.relative(workspaceRoot, skillPath)}`);
                }
              }
            } catch { /* SKILL.md might not exist */ }
          }
        }
      } catch { /* ignore readdir errors */ }
    }

    /**
     * Create skill symlinks from workflows for a specific skills directory
     */
    async function syncWorkflowsToSkills(skillsDir: string, skillName: string): Promise<void> {
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
            // Only record once (for first skill dir)
            if (skillName === 'claude') {
              result.skipped.push(`${name} (workflow is symlink)`);
            }
            continue;
          }

          // Check if skill already exists
          try {
            await fs.access(skillPath);
            const skillStat = await fs.lstat(skillPath);
            if (skillStat.isSymbolicLink()) {
              result.skipped.push(`${skillName}/${name} (skill symlink exists)`);
            } else {
              result.skipped.push(`${skillName}/${name} (skill is real file)`);
            }
            continue;
          } catch {
            // Skill doesn't exist, create symlink
          }

          try {
            await fs.mkdir(skillDir, { recursive: true });
            const relPath = path.relative(skillDir, workflowPath);
            await fs.symlink(relPath, skillPath);
            result.created.push(`${skillName}/${name} (workflow → skill)`);
          } catch (err) {
            result.errors.push(`${skillName}/${name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch {
        // Workflows dir doesn't exist or is empty
      }
    }

    /**
     * Scan skills → create workflow symlinks (for a specific skills directory)
     */
    async function syncSkillsToWorkflows(skillsDir: string, skillName: string): Promise<void> {
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
            result.skipped.push(`${skillName}/${name} (no SKILL.md)`);
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
              result.skipped.push(`${skillName}/${name} (workflow symlink exists)`);
            } else {
              result.skipped.push(`${skillName}/${name} (workflow is real file)`);
            }
            continue;
          } catch {
            // Workflow doesn't exist, create symlink
          }

          try {
            const relPath = path.relative(workflowsDir, skillPath);
            await fs.symlink(relPath, workflowPath);
            result.created.push(`${skillName}/${name} (skill → workflow)`);
          } catch (err) {
            result.errors.push(`${skillName}/${name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch {
        // Skills dir doesn't exist or is empty
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
              result.removed.push(`workflows: ${path.relative(workspaceRoot, fullPath)}`);
            }
          }
        }
      } catch { /* ignore readdir errors */ }

      // 0b. Clean all skill directories
      for (const skillConfig of SKILL_DIRS) {
        const skillsDir = path.join(workspaceRoot, skillConfig.dir);
        await cleanSkillsDir(skillsDir, skillConfig.name);
      }
    }

    // 1. Scan workflows → create skill symlinks (for all skill dirs)
    for (const skillConfig of SKILL_DIRS) {
      const skillsDir = path.join(workspaceRoot, skillConfig.dir);
      await syncWorkflowsToSkills(skillsDir, skillConfig.name);
    }

    // 2. Scan skills → create workflow symlinks (from all skill dirs)
    for (const skillConfig of SKILL_DIRS) {
      const skillsDir = path.join(workspaceRoot, skillConfig.dir);
      await syncSkillsToWorkflows(skillsDir, skillConfig.name);
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
