import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the Dashboard component file
const dashboardPath = path.resolve(__dirname, '../client/src/Dashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf-8');

describe('Dashboard UI Refinements (Static Analysis)', () => {

  it('should use custom hooks for data fetching', () => {
    // Check for useTaskData hook (refactored)
    expect(dashboardContent).toContain('useTaskData');
  });

  it('should have theme controls', () => {
    // Theme toggle functionality
    expect(dashboardContent).toContain('useTheme');
  });

  it('should render KanbanBoard', () => {
    expect(dashboardContent).toContain('<KanbanBoard');
  });

  it('should have agent sidebar', () => {
    expect(dashboardContent).toContain('AgentSidebar');
  });
});