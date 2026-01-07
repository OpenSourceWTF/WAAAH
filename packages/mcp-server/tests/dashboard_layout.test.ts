import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the Dashboard component file
const dashboardPath = path.resolve(__dirname, '../client/src/Dashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

describe('Dashboard Layout Refactor (Static Analysis)', () => {

  it('should have "The Shout" tab', () => {
    // Tab Trigger
    expect(dashboardContent).toContain('value="logs"');
    expect(dashboardContent).toContain('the shout (logs)');
    expect(dashboardContent).toContain('<MessageSquare className="h-4 w-4" />');

    // Tab Content
    // We look for logic that puts ActivityFeed inside tabs
    const tabContentRegex = /<TabsContent value="logs".*?<ActivityFeed \/>.*?<\/TabsContent>/s;
    // Simple regex might be hard due to nesting, but let's try to match the block
    // Or just verify presence near "logs"
    expect(dashboardContent).toContain('<TabsContent value="logs"');
    // We expect ActivityFeed to be used
    expect(dashboardContent).toContain('<ActivityFeed />');
  });

  it('should NOT have ActivityFeed in Sidebar', () => {
    // We expect only 1 occurrence of <ActivityFeed /> (in the tabs)
    const feedMatches = dashboardContent.match(/<ActivityFeed \/>/g);
    expect(feedMatches?.length).toBe(1);

    // Sidebar header "THE SHOUT" should be gone from Sidebar
    // It was: <h2 ...>THE SHOUT</h2>
    // Check if "THE SHOUT" is only present in the Tab Trigger (lowercase "the shout") and maybe "WAAAH BOSS" header?
    // Wait, "WAAAH BOSS" is in header.
    // "THE SHOUT" might appear as "the shout (logs)" (lowercase)

    // Let's check for uppercase "THE SHOUT" which was the old sidebar header
    const uppercaseShout = dashboardContent.match(/THE SHOUT/g);
    // It might be used elsewhere? 
    // In the new code, the tab label is "the shout (logs)".
    // If "THE SHOUT" (uppercase) is found, it might be a remnant or strictly prohibited?
    // Let's check the file content step 492:
    // Line 318: "the shout (logs)" (lowercase).
    // Line 263: "WAAAH BOSS".
    // Line 407: "DA BOYZ".
    // Line 303: "GRETCHIN PIPES".
    // I don't see "THE SHOUT" (uppercase) anywhere.
    // So expectation: Regex /THE SHOUT/ count should be 0.
    expect(uppercaseShout).toBeNull();
  });
});
