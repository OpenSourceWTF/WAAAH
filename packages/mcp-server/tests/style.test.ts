import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// Read the CSS file
const cssPath = path.resolve(__dirname, '../public/style.css');
const cssContent = fs.readFileSync(cssPath, 'utf-8');

describe('CSS Style Overrides', () => {
  it('should define status overrides AFTER priority classes', () => {
    // Priority classes are defined first, status classes must come after to override
    const priorityBlock = cssContent.lastIndexOf('.task-item.priority-');

    // Status classes
    const completedBlock = cssContent.indexOf('.task-item.status-completed');
    const queuedBlock = cssContent.indexOf('.task-item.status-queued');
    const failedBlock = cssContent.indexOf('.task-item.status-failed');

    // Assert order
    expect(priorityBlock).toBeGreaterThan(-1);
    expect(completedBlock).toBeGreaterThan(priorityBlock);
    expect(queuedBlock).toBeGreaterThan(priorityBlock);
    expect(failedBlock).toBeGreaterThan(priorityBlock);
  });

  it('should assign correct colors to statuses', () => {
    // Completed -> Green (--success)
    expect(cssContent).toMatch(/\.task-item\.status-completed\s*\{[^}]*border-left-color:\s*var\(--success\)/);

    // Queued -> Orange (--warning)
    // Note: This might be in a grouped selector, so we check that the selector exists and is followed by the rule
    const queuedRegex = /\.task-item\.status-queued(?:,\s*[\s\S]*?)?\{[^}]*border-left-color:\s*var\(--warning\)/;
    expect(cssContent).toMatch(queuedRegex);

    // Failed -> Red (--danger)
    const failedRegex = /\.task-item\.status-failed(?:,\s*[\s\S]*?)?\{[^}]*border-left-color:\s*var\(--danger\)/;
    expect(cssContent).toMatch(failedRegex);
  });
});
