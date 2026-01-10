/**
 * Health Report Generator
 *
 * Generates Markdown health reports for the Doctor agent.
 * Implements FR-4.1 from the Doctor Agent Spec.
 *
 * @packageDocumentation
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Analysis issue detected by the Doctor.
 */
export interface HealthIssue {
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
  /** Type of issue */
  type: 'complexity' | 'coverage' | 'duplicate' | 'size' | 'missing-tests' | 'other';
  /** File path where issue was found */
  file: string;
  /** Description of the issue */
  message: string;
  /** Line number if applicable */
  line?: number;
}

/**
 * Task created by the Doctor.
 */
export interface CreatedTask {
  /** Task ID */
  id: string;
  /** Task type/capability */
  capability: 'refactor' | 'write-tests' | 'fix';
  /** Brief description */
  description: string;
  /** Target file */
  file: string;
}

/**
 * Health report data to be rendered.
 */
export interface HealthReportData {
  /** Report generation timestamp */
  timestamp: Date;
  /** Git SHA analyzed */
  analyzedSha: string;
  /** Previous SHA (for diff reference) */
  previousSha?: string;
  /** List of files analyzed */
  analyzedFiles: string[];
  /** Issues found during analysis */
  issues: HealthIssue[];
  /** Tasks created as a result */
  createdTasks: CreatedTask[];
  /** Overall health score (0-100) */
  healthScore: number;
  /** Test coverage percentage if available */
  testCoverage?: number;
}

/**
 * Default paths for health reports.
 */
const DEFAULT_LATEST_PATH = '.waaah/health/latest.md';
const DEFAULT_HISTORY_DIR = '.waaah/health/history';

/**
 * Generates and persists health reports for the Doctor agent.
 *
 * @example
 * ```typescript
 * const generator = new HealthReportGenerator('/path/to/repo');
 *
 * const report: HealthReportData = {
 *   timestamp: new Date(),
 *   analyzedSha: 'abc123',
 *   analyzedFiles: ['src/index.ts', 'src/utils.ts'],
 *   issues: [{ severity: 'warning', type: 'complexity', file: 'src/utils.ts', message: 'High complexity' }],
 *   createdTasks: [],
 *   healthScore: 85,
 * };
 *
 * generator.generate(report);
 * ```
 */
export class HealthReportGenerator {
  private workspaceRoot: string;
  private latestPath: string;
  private historyDir: string;

  /**
   * Creates a new HealthReportGenerator.
   * @param workspaceRoot - Root directory of the repository
   * @param latestPath - Optional custom path for latest.md
   * @param historyDir - Optional custom path for history directory
   */
  constructor(workspaceRoot: string, latestPath?: string, historyDir?: string) {
    this.workspaceRoot = workspaceRoot;
    this.latestPath = latestPath || path.join(workspaceRoot, DEFAULT_LATEST_PATH);
    this.historyDir = historyDir || path.join(workspaceRoot, DEFAULT_HISTORY_DIR);
  }

  /**
   * Generates and saves a health report.
   * @param data - Report data to render
   * @returns Path to the generated latest.md file
   */
  public generate(data: HealthReportData): string {
    const markdown = this.renderMarkdown(data);

    // Ensure directories exist
    this.ensureDirectories();

    // Write latest.md (overwrite)
    fs.writeFileSync(this.latestPath, markdown);

    // Archive to history
    const historyFilename = `${this.formatTimestamp(data.timestamp)}.md`;
    const historyPath = path.join(this.historyDir, historyFilename);
    fs.writeFileSync(historyPath, markdown);

    return this.latestPath;
  }

  /**
   * Renders the health report as Markdown.
   * @param data - Report data
   * @returns Formatted Markdown string
   */
  public renderMarkdown(data: HealthReportData): string {
    const lines: string[] = [];

    // Header
    lines.push('# 🩺 WAAAH Doctor Health Report');
    lines.push('');
    lines.push(`**Generated:** ${data.timestamp.toISOString()}`);
    lines.push(`**Analyzed Commit:** \`${data.analyzedSha.slice(0, 8)}\``);
    if (data.previousSha) {
      lines.push(`**Previous Commit:** \`${data.previousSha.slice(0, 8)}\``);
    }
    lines.push('');

    // Health Score
    lines.push('---');
    lines.push('');
    lines.push('## 📊 Health Score');
    lines.push('');
    lines.push(this.renderHealthScore(data.healthScore));
    if (data.testCoverage !== undefined) {
      lines.push(`**Test Coverage:** ${data.testCoverage.toFixed(1)}%`);
    }
    lines.push('');

    // Summary
    lines.push('---');
    lines.push('');
    lines.push('## 📋 Summary');
    lines.push('');
    lines.push(`- **Files Analyzed:** ${data.analyzedFiles.length}`);
    lines.push(`- **Issues Found:** ${data.issues.length}`);
    lines.push(`- **Tasks Created:** ${data.createdTasks.length}`);
    lines.push('');

    // Issues Section
    if (data.issues.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## ⚠️ Issues');
      lines.push('');
      lines.push('| Severity | Type | File | Message |');
      lines.push('|----------|------|------|---------|');
      for (const issue of data.issues) {
        const severityIcon = this.getSeverityIcon(issue.severity);
        const lineInfo = issue.line ? `:${issue.line}` : '';
        lines.push(`| ${severityIcon} ${issue.severity} | ${issue.type} | \`${issue.file}${lineInfo}\` | ${issue.message} |`);
      }
      lines.push('');
    }

    // Tasks Created Section
    if (data.createdTasks.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 📝 Tasks Created');
      lines.push('');
      for (const task of data.createdTasks) {
        lines.push(`- **${task.id}** (${task.capability}): ${task.description}`);
        lines.push(`  - Target: \`${task.file}\``);
      }
      lines.push('');
    }

    // Files Analyzed Section
    if (data.analyzedFiles.length > 0) {
      lines.push('---');
      lines.push('');
      lines.push('## 📁 Files Analyzed');
      lines.push('');
      lines.push('<details>');
      lines.push('<summary>Click to expand</summary>');
      lines.push('');
      for (const file of data.analyzedFiles) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Report generated by WAAAH Doctor Agent*');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Renders a visual health score indicator.
   */
  private renderHealthScore(score: number): string {
    const emoji = score >= 90 ? '🟢' : score >= 70 ? '🟡' : score >= 50 ? '🟠' : '🔴';
    const status = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Needs Attention';
    return `${emoji} **${score}/100** - ${status}`;
  }

  /**
   * Gets the icon for a severity level.
   */
  private getSeverityIcon(severity: 'info' | 'warning' | 'error'): string {
    switch (severity) {
      case 'error': return '🔴';
      case 'warning': return '🟡';
      case 'info': return '🔵';
    }
  }

  /**
   * Formats a timestamp for use in filenames.
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace(/[:.]/g, '-');
  }

  /**
   * Ensures the required directories exist.
   */
  private ensureDirectories(): void {
    const latestDir = path.dirname(this.latestPath);
    if (!fs.existsSync(latestDir)) {
      fs.mkdirSync(latestDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyDir)) {
      fs.mkdirSync(this.historyDir, { recursive: true });
    }
  }

  /**
   * Lists available report history.
   * @returns Array of history file paths
   */
  public listHistory(): string[] {
    if (!fs.existsSync(this.historyDir)) {
      return [];
    }
    return fs.readdirSync(this.historyDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(this.historyDir, f))
      .sort()
      .reverse();
  }

  /**
   * Reads the latest report if it exists.
   * @returns Report content or null
   */
  public readLatest(): string | null {
    if (fs.existsSync(this.latestPath)) {
      return fs.readFileSync(this.latestPath, 'utf-8');
    }
    return null;
  }
}
