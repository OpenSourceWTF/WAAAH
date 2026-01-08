import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the Dashboard component file
const dashboardPath = path.resolve(__dirname, '../client/src/Dashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

describe('Dashboard UI Refinements (Static Analysis)', () => {

  it('should have large numbers for Summary Cards', () => {
    // Verify text-4xl for the numbers (Agents, Tasks, Completed)
    const textLargeMatches = dashboardContent.match(/text-4xl/g);
    expect(textLargeMatches?.length).toBeGreaterThanOrEqual(3);

    // Verify icons h-6 w-6
    const iconMatches = dashboardContent.match(/h-6 w-6/g);
    expect(iconMatches?.length).toBeGreaterThanOrEqual(3);
  });

  it('should have Search and Filter controls', () => {
    // Search Input
    expect(dashboardContent).toContain('placeholder="SEARCH SCRIBBLINGS..."');

    // Filter Select
    expect(dashboardContent).toContain('value={statusFilter}');
    expect(dashboardContent).toContain('<option value="ALL">ALL FINISHED</option>');
  });
});
