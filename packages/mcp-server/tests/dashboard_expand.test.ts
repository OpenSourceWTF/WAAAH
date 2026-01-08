import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the Dashboard component file
const dashboardPath = path.resolve(__dirname, '../client/src/Dashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

describe('Dashboard Expandable Cards (Static Analysis)', () => {

  it('should implement toggle logic', () => {
    expect(dashboardContent).toContain('const toggleTask = (taskId: string) => {');
    expect(dashboardContent).toContain('setExpandedTasks(prev => {');
    expect(dashboardContent).toContain('onClick={() => toggleTask(task.id)}');
  });

  it('should show Task Details on expansion', () => {
    // Check for expanded content
    expect(dashboardContent).toContain('FULL PROMPT:');
    expect(dashboardContent).toContain('ASSIGNED TO:');
    expect(dashboardContent).toContain('RESPONSE PAYLOAD:');
  });

  it('should have action buttons', () => {
    // Check for Cancel and Retry buttons
    expect(dashboardContent).toContain('Cancel Task');
    expect(dashboardContent).toContain('Retry');
    expect(dashboardContent).toContain('handleCancelTask');
    expect(dashboardContent).toContain('handleRetryTask');
  });
});
