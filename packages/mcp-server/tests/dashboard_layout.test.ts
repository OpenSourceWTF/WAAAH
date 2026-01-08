import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the Dashboard component file
const dashboardPath = path.resolve(__dirname, '../client/src/Dashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

describe('Dashboard Layout Refactor (Static Analysis)', () => {

  it('should have logs tab', () => {
    // Tab Trigger
    expect(dashboardContent).toContain('value="logs"');
    expect(dashboardContent).toContain('<MessageSquare className="h-4 w-4" />');

    // Tab Content
    expect(dashboardContent).toContain('<TabsContent value="logs"');
    // We expect ActivityFeed to be used
    expect(dashboardContent).toContain('<ActivityFeed />');
  });

  it('should have ActivityFeed in logs tab only', () => {
    // We expect only 1 occurrence of <ActivityFeed /> (in the tabs)
    const feedMatches = dashboardContent.match(/<ActivityFeed \/>/g);
    expect(feedMatches?.length).toBe(1);
  });

  it('should have theme toggle buttons', () => {
    expect(dashboardContent).toContain("setTheme('LIGHT')");
    expect(dashboardContent).toContain("setTheme('DARK')");
    expect(dashboardContent).toContain("setTheme('WAAAH')");
  });
});
