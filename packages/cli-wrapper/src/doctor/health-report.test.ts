/**
 * Health Report Generator Tests
 *
 * Tests for the Doctor agent's health report generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HealthReportGenerator,
  type HealthReportData,
  type HealthIssue,
  type CreatedTask,
} from './health-report.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('HealthReportGenerator', () => {
  let tempDir: string;
  let generator: HealthReportGenerator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-report-test-'));
    generator = new HealthReportGenerator(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createSampleReport = (): HealthReportData => ({
    timestamp: new Date('2026-01-10T12:00:00Z'),
    analyzedSha: 'abc123def456789',
    analyzedFiles: ['src/index.ts', 'src/utils.ts'],
    issues: [],
    createdTasks: [],
    healthScore: 85,
  });

  describe('generate', () => {
    it('should create latest.md file', () => {
      const report = createSampleReport();
      const resultPath = generator.generate(report);

      expect(fs.existsSync(resultPath)).toBe(true);
      expect(resultPath).toContain('latest.md');
    });

    it('should create history file with timestamp', () => {
      const report = createSampleReport();
      generator.generate(report);

      const historyDir = path.join(tempDir, '.waaah/health/history');
      expect(fs.existsSync(historyDir)).toBe(true);

      const historyFiles = fs.readdirSync(historyDir);
      expect(historyFiles.length).toBe(1);
      expect(historyFiles[0]).toContain('2026-01-10');
    });

    it('should overwrite latest.md on subsequent calls', () => {
      const report1 = createSampleReport();
      report1.healthScore = 70;
      generator.generate(report1);

      const report2 = createSampleReport();
      report2.healthScore = 90;
      generator.generate(report2);

      const content = fs.readFileSync(path.join(tempDir, '.waaah/health/latest.md'), 'utf-8');
      expect(content).toContain('90/100');
      expect(content).not.toContain('70/100');
    });
  });

  describe('renderMarkdown', () => {
    it('should include header with timestamp and SHA', () => {
      const report = createSampleReport();
      const markdown = generator.renderMarkdown(report);

      expect(markdown).toContain('# 🩺 WAAAH Doctor Health Report');
      expect(markdown).toContain('2026-01-10');
      expect(markdown).toContain('abc123de');
    });

    it('should render health score with correct emoji', () => {
      const report = createSampleReport();

      report.healthScore = 95;
      expect(generator.renderMarkdown(report)).toContain('🟢');
      expect(generator.renderMarkdown(report)).toContain('Excellent');

      report.healthScore = 75;
      expect(generator.renderMarkdown(report)).toContain('🟡');
      expect(generator.renderMarkdown(report)).toContain('Good');

      report.healthScore = 55;
      expect(generator.renderMarkdown(report)).toContain('🟠');
      expect(generator.renderMarkdown(report)).toContain('Fair');

      report.healthScore = 30;
      expect(generator.renderMarkdown(report)).toContain('🔴');
      expect(generator.renderMarkdown(report)).toContain('Needs Attention');
    });

    it('should include test coverage if provided', () => {
      const report = createSampleReport();
      report.testCoverage = 87.5;

      const markdown = generator.renderMarkdown(report);
      expect(markdown).toContain('Test Coverage');
      expect(markdown).toContain('87.5%');
    });

    it('should render issues table', () => {
      const report = createSampleReport();
      const issue: HealthIssue = {
        severity: 'warning',
        type: 'complexity',
        file: 'src/complex.ts',
        message: 'High cyclomatic complexity',
        line: 42,
      };
      report.issues = [issue];

      const markdown = generator.renderMarkdown(report);
      expect(markdown).toContain('## ⚠️ Issues');
      expect(markdown).toContain('🟡 warning');
      expect(markdown).toContain('complexity');
      expect(markdown).toContain('src/complex.ts:42');
      expect(markdown).toContain('High cyclomatic complexity');
    });

    it('should render created tasks', () => {
      const report = createSampleReport();
      const task: CreatedTask = {
        id: 'T-123',
        capability: 'write-tests',
        description: 'Add tests for utils module',
        file: 'src/utils.ts',
      };
      report.createdTasks = [task];

      const markdown = generator.renderMarkdown(report);
      expect(markdown).toContain('## 📝 Tasks Created');
      expect(markdown).toContain('T-123');
      expect(markdown).toContain('write-tests');
      expect(markdown).toContain('Add tests for utils module');
    });

    it('should render analyzed files in collapsible section', () => {
      const report = createSampleReport();
      const markdown = generator.renderMarkdown(report);

      expect(markdown).toContain('## 📁 Files Analyzed');
      expect(markdown).toContain('<details>');
      expect(markdown).toContain('src/index.ts');
      expect(markdown).toContain('src/utils.ts');
    });

    it('should include previous SHA if provided', () => {
      const report = createSampleReport();
      report.previousSha = 'def789abc123456';

      const markdown = generator.renderMarkdown(report);
      expect(markdown).toContain('Previous Commit');
      expect(markdown).toContain('def789ab');
    });
  });

  describe('listHistory', () => {
    it('should return empty array when no history', () => {
      const history = generator.listHistory();
      expect(history).toEqual([]);
    });

    it('should return history files in reverse chronological order', () => {
      // Generate multiple reports
      const report1 = createSampleReport();
      report1.timestamp = new Date('2026-01-10T10:00:00Z');
      generator.generate(report1);

      const report2 = createSampleReport();
      report2.timestamp = new Date('2026-01-10T12:00:00Z');
      generator.generate(report2);

      const history = generator.listHistory();
      expect(history.length).toBe(2);
      // First entry should be the more recent one
      expect(history[0]).toContain('12-00-00');
    });
  });

  describe('readLatest', () => {
    it('should return null when no latest exists', () => {
      expect(generator.readLatest()).toBeNull();
    });

    it('should return latest report content', () => {
      const report = createSampleReport();
      generator.generate(report);

      const content = generator.readLatest();
      expect(content).toBeTruthy();
      expect(content).toContain('Health Report');
    });
  });
});
