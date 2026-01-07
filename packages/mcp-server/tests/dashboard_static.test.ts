import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// Read the Dashboard component file
const dashboardPath = path.resolve(__dirname, '../client/src/Dashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

describe('Dashboard Historic View (Static Analysis)', () => {
  it('should construct correct history API URL', () => {
    // Check for URL construction with status filters
    const urlPattern = /tasksUrl\s*=\s*`\$\{API_BASE\}\/tasks\/history\?status=COMPLETED,FAILED,CANCELLED&limit=50&offset=\$\{offset\}`/;
    expect(dashboardContent).toMatch(urlPattern);
  });

  it('should reset state on tab switch', () => {
    // Check effect dependency on activeTab
    expect(dashboardContent).toMatch(/if \(activeTab === 'history'\) \{[\s\S]*?setTasks\(\[\]\)[\s\S]*?setOffset\(0\)[\s\S]*?setHasMore\(true\)/);
  });

  it('should implement load more logic', () => {
    // Check offset increment
    expect(dashboardContent).toMatch(/setOffset\(prev => prev \+ 50\)/);
  });

  it('should render Load More button conditionally', () => {
    // Check condition
    expect(dashboardContent).toMatch(/\{isHistory && hasMore && \(/);
    // Check button text
    expect(dashboardContent).toMatch(/Load More History/);
  });
});
