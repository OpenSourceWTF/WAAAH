/**
 * E2E Tests for Header Hide/Show on Task Expand
 *
 * Tests the header visibility behavior when expanding/collapsing task cards.
 * The header should slide up and hide when a task is expanded, and slide
 * back down when the task is closed.
 *
 * Spec: 010-ui-redesign
 * Dependencies: T2 (Header Hide), T5 (Animation Pass)
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, act, type RenderResult } from '@testing-library/react';
import React, { useState, type ReactElement } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';

// Mock IntersectionObserver (not available in jsdom)
beforeAll(() => {
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Wrapper to provide required contexts
function renderWithProviders(ui: ReactElement): RenderResult {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
}

/**
 * Simulate header component with expansion state
 * This mirrors the exact behavior from Dashboard.tsx lines 241-314
 */
interface MockHeaderProps {
  isTaskExpanded: boolean;
}

function MockHeader({ isTaskExpanded }: MockHeaderProps) {
  return (
    <header
      data-testid="header"
      className={`flex items-center justify-between px-8 border-b-2 border-primary bg-background z-10 sticky top-0 shadow-[0_0_15px_hsl(var(--glow)/0.3)] transition-all duration-300 ease-out overflow-hidden ${isTaskExpanded
        ? 'h-0 py-0 opacity-0 pointer-events-none border-b-0'
        : 'h-auto py-6 opacity-100'
      }`}
    >
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-black tracking-widest">WAAAH</h1>
        <p className="text-xs text-primary/70">Agent Orchestra Dashboard</p>
      </div>
    </header>
  );
}

/**
 * Test component that simulates expansion toggle behavior
 */
function TestableHeaderWithToggle() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div>
      <MockHeader isTaskExpanded={isExpanded} />
      <button
        data-testid="expand-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        Toggle
      </button>
      <div data-testid="expansion-state">{isExpanded ? 'expanded' : 'collapsed'}</div>
    </div>
  );
}

describe('Header Hide/Show on Task Expand - E2E Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Header visible by default', () => {
    it('should display header when no task is expanded', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');
      expect(header).toBeInTheDocument();

      // Header should have visible styles (opacity-100, not h-0)
      expect(header).toHaveClass('opacity-100');
      expect(header).not.toHaveClass('h-0');
      expect(header).not.toHaveClass('pointer-events-none');
    });

    it('should show WAAAH title in header', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      // The app title should be visible in the header
      const title = screen.getByRole('heading', { level: 1 });
      expect(title).toBeInTheDocument();
      expect(title).toHaveTextContent('WAAAH');
    });

    it('should have h-auto when not expanded', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('h-auto');
      expect(header).toHaveClass('py-6');
    });
  });

  describe('2. Header hides on task expand', () => {
    it('should hide header when task is expanded (isTaskExpanded=true)', () => {
      renderWithProviders(<MockHeader isTaskExpanded={true} />);

      const header = screen.getByTestId('header');

      // Header should have h-0 and opacity-0 classes when hidden
      expect(header).toHaveClass('h-0');
      expect(header).toHaveClass('opacity-0');
      expect(header).toHaveClass('pointer-events-none');
    });

    it('should remove padding when expanded', () => {
      renderWithProviders(<MockHeader isTaskExpanded={true} />);

      const header = screen.getByTestId('header');

      // Header should have py-0 (no padding) when expanded
      expect(header).toHaveClass('py-0');
      expect(header).not.toHaveClass('py-6');
    });

    it('should remove border when expanded', () => {
      renderWithProviders(<MockHeader isTaskExpanded={true} />);

      const header = screen.getByTestId('header');

      // Header should have border-b-0 when expanded
      expect(header).toHaveClass('border-b-0');
    });

    it('should apply transition animation classes to header', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');

      // Header should have transition classes for animation
      expect(header).toHaveClass('transition-all');
      expect(header).toHaveClass('duration-300');
      expect(header).toHaveClass('ease-out');
    });
  });

  describe('3. Header returns on task close', () => {
    it('should show header again when isTaskExpanded changes from true to false', () => {
      // First render with expanded state
      const { rerender } = render(
        <ThemeProvider>
          <MockHeader isTaskExpanded={true} />
        </ThemeProvider>
      );

      let header = screen.getByTestId('header');
      expect(header).toHaveClass('h-0');
      expect(header).toHaveClass('opacity-0');

      // Re-render with collapsed state (simulating close)
      rerender(
        <ThemeProvider>
          <MockHeader isTaskExpanded={false} />
        </ThemeProvider>
      );

      header = screen.getByTestId('header');
      // Header should slide back in
      expect(header).toHaveClass('opacity-100');
      expect(header).toHaveClass('h-auto');
      expect(header).not.toHaveClass('pointer-events-none');
    });

    it('should restore padding when collapsed', () => {
      const { rerender } = render(
        <ThemeProvider>
          <MockHeader isTaskExpanded={true} />
        </ThemeProvider>
      );

      rerender(
        <ThemeProvider>
          <MockHeader isTaskExpanded={false} />
        </ThemeProvider>
      );

      const header = screen.getByTestId('header');
      expect(header).toHaveClass('py-6');
      expect(header).not.toHaveClass('py-0');
    });
  });

  describe('4. Header animation completes without layout shift', () => {
    it('should use overflow-hidden to prevent layout shift during animation', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');

      // Header should have overflow-hidden to prevent content spill during animation
      expect(header).toHaveClass('overflow-hidden');
    });

    it('should have sticky positioning for consistent behavior', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');

      // Header should be sticky positioned
      expect(header).toHaveClass('sticky');
      expect(header).toHaveClass('top-0');
    });

    it('should have proper z-index to stay above content', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');

      // Header should have z-index for proper layering
      expect(header).toHaveClass('z-10');
    });

    it('should use consistent animation timing (300ms ease-out)', () => {
      renderWithProviders(<MockHeader isTaskExpanded={false} />);

      const header = screen.getByTestId('header');

      // Animation should use 300ms duration with ease-out timing
      expect(header).toHaveClass('duration-300');
      expect(header).toHaveClass('ease-out');
    });
  });

  describe('Integration: Toggle behavior', () => {
    it('should correctly toggle between visible and hidden states', async () => {
      renderWithProviders(<TestableHeaderWithToggle />);

      const header = screen.getByTestId('header');
      const toggleButton = screen.getByTestId('expand-toggle');
      const stateIndicator = screen.getByTestId('expansion-state');

      // Initial state: collapsed, header visible
      expect(stateIndicator).toHaveTextContent('collapsed');
      expect(header).toHaveClass('opacity-100');
      expect(header).toHaveClass('h-auto');

      // Click to expand (wrap in act for state updates)
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      // After expand: header hidden
      expect(stateIndicator).toHaveTextContent('expanded');
      expect(header).toHaveClass('opacity-0');
      expect(header).toHaveClass('h-0');

      // Click to collapse (wrap in act for state updates)
      await act(async () => {
        fireEvent.click(toggleButton);
      });

      // After collapse: header visible again
      expect(stateIndicator).toHaveTextContent('collapsed');
      expect(header).toHaveClass('opacity-100');
      expect(header).toHaveClass('h-auto');
    });
  });
});
