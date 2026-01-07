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

  it('should show Active Task Details on expansion', () => {
    // We look for the Active Tasks section (TabsContent value="tasks")
    // But since checking structure via regex is hard, we look for unique strings used in that section.
    // "Mission Prompt" is used in Active task expansion
    expect(dashboardContent).toContain('Mission Prompt');

    // "From" and "To"
    expect(dashboardContent).toContain('<span className="block opacity-50 text-[10px] uppercase">From</span>');
    expect(dashboardContent).toContain('<span className="block opacity-50 text-[10px] uppercase">To</span>');

    // Result Report
    expect(dashboardContent).toContain('Result Report');
  });

  it('should show History Task Details on expansion', () => {
    // History uses ":: RESULT ::" instead of "Result Report"?
    // Let's check line 395 in the view: ":: RESULT ::"
    expect(dashboardContent).toContain(':: RESULT ::');

    // It shows prompt
    // It shows timestamp
    expect(dashboardContent).toContain('new Date((task as any).completedAt).toLocaleString()');
  });
});
