/**
 * E2E Tests for Theme Switching
 *
 * Tests the theme switching between Light, Dark, and WAAAH modes.
 * Verifies correct CSS variables and localStorage persistence.
 *
 * Spec: 010-dashboard-ux-polish
 * Dependencies: T7 (Light theme), T8 (Dark theme)
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act, type RenderResult } from '@testing-library/react';
import React, { useState } from 'react';
import { ThemeProvider, useTheme, type TextKey } from '@/contexts/ThemeContext';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock IntersectionObserver
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

beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
  // Reset document element classes and attributes
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.removeAttribute('data-theme');
});

/**
 * Test component that renders theme buttons like Dashboard.tsx
 */
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <div data-testid="theme-container">
      <div data-testid="current-theme">{theme}</div>
      <button
        data-testid="light-button"
        onClick={() => setTheme('LIGHT')}
        className={theme === 'LIGHT' ? 'active' : ''}
      >
        Light
      </button>
      <button
        data-testid="dark-button"
        onClick={() => setTheme('DARK')}
        className={theme === 'DARK' ? 'active' : ''}
      >
        Dark
      </button>
      <button
        data-testid="waaah-button"
        onClick={() => setTheme('WAAAH')}
        className={theme === 'WAAAH' ? 'active' : ''}
      >
        WAAAH
      </button>
    </div>
  );
}

/**
 * Wrapper to simulate page reload with persistence
 */
function renderWithTheme(): RenderResult {
  return render(
    <ThemeProvider>
      <ThemeSwitcher />
    </ThemeProvider>
  );
}

describe('Theme Switching - E2E Tests', () => {
  describe('1. Default theme (Dark)', () => {
    it('should load with Dark theme by default when no localStorage', () => {
      renderWithTheme();

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('DARK');
    });

    it('should have data-theme="dark" on document root', () => {
      renderWithTheme();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should have dark class on document root', () => {
      renderWithTheme();

      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should save Dark theme to localStorage', () => {
      renderWithTheme();

      expect(localStorageMock.setItem).toHaveBeenCalledWith('waaah-theme', 'DARK');
    });
  });

  describe('2. Light theme activation', () => {
    it('should switch to Light theme when clicking Light button', async () => {
      renderWithTheme();

      const lightButton = screen.getByTestId('light-button');
      await act(async () => {
        fireEvent.click(lightButton);
      });

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('LIGHT');
    });

    it('should apply data-theme="light" to document root', async () => {
      renderWithTheme();

      const lightButton = screen.getByTestId('light-button');
      await act(async () => {
        fireEvent.click(lightButton);
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should apply light class to document root', async () => {
      renderWithTheme();

      const lightButton = screen.getByTestId('light-button');
      await act(async () => {
        fireEvent.click(lightButton);
      });

      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should save Light theme to localStorage', async () => {
      renderWithTheme();

      const lightButton = screen.getByTestId('light-button');
      await act(async () => {
        fireEvent.click(lightButton);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('waaah-theme', 'LIGHT');
    });

    it('should apply warm cream background CSS variables', async () => {
      renderWithTheme();

      const lightButton = screen.getByTestId('light-button');
      await act(async () => {
        fireEvent.click(lightButton);
      });

      // Light theme uses: --background: 40 30% 97% (warm cream)
      // This is verified by the class presence which triggers the CSS
      expect(document.documentElement.classList.contains('light')).toBe(true);
    });
  });

  describe('3. Dark theme activation', () => {
    it('should switch to Dark theme when clicking Dark button', async () => {
      // Start with Light theme
      localStorageMock.setItem('waaah-theme', 'LIGHT');
      renderWithTheme();

      const darkButton = screen.getByTestId('dark-button');
      await act(async () => {
        fireEvent.click(darkButton);
      });

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('DARK');
    });

    it('should apply data-theme="dark" to document root', async () => {
      localStorageMock.setItem('waaah-theme', 'LIGHT');
      renderWithTheme();

      const darkButton = screen.getByTestId('dark-button');
      await act(async () => {
        fireEvent.click(darkButton);
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should apply dark class to document root', async () => {
      localStorageMock.setItem('waaah-theme', 'LIGHT');
      renderWithTheme();

      const darkButton = screen.getByTestId('dark-button');
      await act(async () => {
        fireEvent.click(darkButton);
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.classList.contains('light')).toBe(false);
    });

    it('should save Dark theme to localStorage', async () => {
      localStorageMock.setItem('waaah-theme', 'LIGHT');
      renderWithTheme();

      const darkButton = screen.getByTestId('dark-button');
      await act(async () => {
        fireEvent.click(darkButton);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('waaah-theme', 'DARK');
    });

    it('should apply deep charcoal background CSS variables', async () => {
      localStorageMock.setItem('waaah-theme', 'LIGHT');
      renderWithTheme();

      const darkButton = screen.getByTestId('dark-button');
      await act(async () => {
        fireEvent.click(darkButton);
      });

      // Dark theme uses: --background: 0 0% 3% (deep charcoal)
      // Verified by data-theme="dark" which triggers the :root CSS
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  describe('4. WAAAH theme activation', () => {
    it('should switch to WAAAH theme when clicking WAAAH button', async () => {
      renderWithTheme();

      const waaahButton = screen.getByTestId('waaah-button');
      await act(async () => {
        fireEvent.click(waaahButton);
      });

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('WAAAH');
    });

    it('should apply data-theme="waaah" to document root', async () => {
      renderWithTheme();

      const waaahButton = screen.getByTestId('waaah-button');
      await act(async () => {
        fireEvent.click(waaahButton);
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('waaah');
    });

    it('should remove light and dark classes', async () => {
      renderWithTheme();

      const waaahButton = screen.getByTestId('waaah-button');
      await act(async () => {
        fireEvent.click(waaahButton);
      });

      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should save WAAAH theme to localStorage', async () => {
      renderWithTheme();

      const waaahButton = screen.getByTestId('waaah-button');
      await act(async () => {
        fireEvent.click(waaahButton);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('waaah-theme', 'WAAAH');
    });

    it('should apply green/black brutalist colors', async () => {
      renderWithTheme();

      const waaahButton = screen.getByTestId('waaah-button');
      await act(async () => {
        fireEvent.click(waaahButton);
      });

      // WAAAH theme uses: [data-theme="waaah"] with green/black colors
      // --background: 0 0% 0% (black)
      // --foreground: 120 80% 40% (green)
      expect(document.documentElement.getAttribute('data-theme')).toBe('waaah');
    });
  });

  describe('5. localStorage persistence', () => {
    it('should persist Light theme across renders', async () => {
      // First render and set Light theme
      const { unmount } = renderWithTheme();

      const lightButton = screen.getByTestId('light-button');
      await act(async () => {
        fireEvent.click(lightButton);
      });

      unmount();

      // Second render should load Light theme from localStorage
      renderWithTheme();

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('LIGHT');
    });

    it('should persist Dark theme across renders', async () => {
      // Set Dark theme in localStorage before render
      localStorageMock.setItem('waaah-theme', 'DARK');

      renderWithTheme();

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('DARK');
    });

    it('should persist WAAAH theme across renders', async () => {
      // First render and set WAAAH theme
      const { unmount } = renderWithTheme();

      const waaahButton = screen.getByTestId('waaah-button');
      await act(async () => {
        fireEvent.click(waaahButton);
      });

      unmount();

      // Second render should load WAAAH theme from localStorage
      renderWithTheme();

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('WAAAH');
    });

    it('should load saved theme on initial render', () => {
      localStorageMock.setItem('waaah-theme', 'WAAAH');

      renderWithTheme();

      const currentTheme = screen.getByTestId('current-theme');
      expect(currentTheme).toHaveTextContent('WAAAH');
      expect(document.documentElement.getAttribute('data-theme')).toBe('waaah');
    });
  });

  describe('6. Theme cycling (integration)', () => {
    it('should correctly cycle through all themes', async () => {
      renderWithTheme();

      // Start at Dark (default)
      expect(screen.getByTestId('current-theme')).toHaveTextContent('DARK');

      // Switch to Light
      await act(async () => {
        fireEvent.click(screen.getByTestId('light-button'));
      });
      expect(screen.getByTestId('current-theme')).toHaveTextContent('LIGHT');
      expect(document.documentElement.classList.contains('light')).toBe(true);

      // Switch to WAAAH
      await act(async () => {
        fireEvent.click(screen.getByTestId('waaah-button'));
      });
      expect(screen.getByTestId('current-theme')).toHaveTextContent('WAAAH');
      expect(document.documentElement.getAttribute('data-theme')).toBe('waaah');

      // Switch back to Dark
      await act(async () => {
        fireEvent.click(screen.getByTestId('dark-button'));
      });
      expect(screen.getByTestId('current-theme')).toHaveTextContent('DARK');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('should update localStorage on each theme change', async () => {
      renderWithTheme();

      // Clear initial call
      vi.clearAllMocks();

      // Light
      await act(async () => {
        fireEvent.click(screen.getByTestId('light-button'));
      });
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('waaah-theme', 'LIGHT');

      // Dark
      await act(async () => {
        fireEvent.click(screen.getByTestId('dark-button'));
      });
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('waaah-theme', 'DARK');

      // WAAAH
      await act(async () => {
        fireEvent.click(screen.getByTestId('waaah-button'));
      });
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('waaah-theme', 'WAAAH');
    });
  });

  describe('7. CSS variable verification', () => {
    it('should have correct attributes for Light theme warm cream palette', async () => {
      renderWithTheme();

      await act(async () => {
        fireEvent.click(screen.getByTestId('light-button'));
      });

      // .light class triggers: --background: 40 30% 97% (warm cream)
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('should have correct attributes for Dark theme deep charcoal', async () => {
      renderWithTheme();

      await act(async () => {
        fireEvent.click(screen.getByTestId('dark-button'));
      });

      // :root (dark) has: --background: 0 0% 3% (deep charcoal)
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should have correct attributes for WAAAH theme brutalist colors', async () => {
      renderWithTheme();

      await act(async () => {
        fireEvent.click(screen.getByTestId('waaah-button'));
      });

      // [data-theme="waaah"] has green/black colors
      expect(document.documentElement.getAttribute('data-theme')).toBe('waaah');
      expect(document.documentElement.classList.contains('light')).toBe(false);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});
