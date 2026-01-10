import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../src/contexts/ThemeContext';
import React from 'react';

// Test component to consume the context
const TestComponent = () => {
  const { theme, setTheme, t } = useTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="translated-text">{t('APP_TITLE')}</span>
      <button onClick={() => setTheme('LIGHT')}>Set Light</button>
      <button onClick={() => setTheme('WAAAH')}>Set WAAAH</button>
    </div>
  );
};

describe('ThemeContext', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('provides default theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );
    expect(screen.getByTestId('current-theme').textContent).toBe('DARK');
  });

  it('updates theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const lightButton = screen.getByText('Set Light');
    act(() => {
      lightButton.click();
    });
    expect(screen.getByTestId('current-theme').textContent).toBe('LIGHT');
  });

  it('translates text based on theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Default (DARK) -> PROFESSIONAL
    expect(screen.getByTestId('translated-text').textContent).toBe('WAAAH DASHBOARD');

    // Switch to WAAAH
    const waaahButton = screen.getByText('Set WAAAH');
    act(() => {
      waaahButton.click();
    });

    // WAAAH -> WAAAH Map
    expect(screen.getByTestId('translated-text').textContent).toBe('WAAAH BOSS');
  });
});
