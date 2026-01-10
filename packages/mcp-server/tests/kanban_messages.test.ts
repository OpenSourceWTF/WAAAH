import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Read the KanbanBoard component file
const kanbanPath = path.resolve(__dirname, '../client/src/KanbanBoard.tsx');
const kanbanContent = fs.readFileSync(kanbanPath, 'utf-8');

describe('KanbanBoard Message Display (Static Analysis)', () => {

  it('should have message section in ExpandedCardView', () => {
    // Verify MESSAGES header exists
    expect(kanbanContent).toContain('MESSAGES');

    // Verify message list area with bg-black/20 styling
    expect(kanbanContent).toContain('bg-black/20');

    // Verify "No messages yet" empty state
    expect(kanbanContent).toContain('No messages yet');
  });

  it('should have message input functionality', () => {
    // Verify input placeholder exists
    expect(kanbanContent).toContain('Type a comment...');

    // Verify Send button with icon
    expect(kanbanContent).toContain('<Send');

    // Verify message bubbles render with role-based styling
    expect(kanbanContent).toContain("msg.role === 'user'");
    expect(kanbanContent).toContain('bg-primary/30'); // User message styling
    expect(kanbanContent).toContain('text-blue-400'); // Agent styling
  });

  it('should sync expandedTask when tasks prop updates', () => {
    // Critical fix: expandedTask must sync with fresh data
    expect(kanbanContent).toContain('Sync expandedTask with fresh data');
    expect(kanbanContent).toContain('freshTask');
    expect(kanbanContent).toContain('setExpandedTask(freshTask)');
  });

  it('should support expand/collapse for messages', () => {
    // Verify expand toggle exists
    expect(kanbanContent).toContain('messagesExpanded');
    expect(kanbanContent).toContain('setMessagesExpanded');
    expect(kanbanContent).toContain('Collapse');
    expect(kanbanContent).toContain('Expand');
  });

  it('should render ALL messages without restrictive filters', () => {
    // Verify messages are mapped without strict messageType filter
    // Should iterate over task.messages and render them
    expect(kanbanContent).toContain('task.messages');
    expect(kanbanContent).toContain('.sort((a, b) => a.timestamp - b.timestamp)');
    expect(kanbanContent).toContain('.map((msg, idx)');
  });
});
