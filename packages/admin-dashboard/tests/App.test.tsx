import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '@/App';
import React from 'react';

// Mock Dashboard since it's complex and tested separately
vi.mock('@/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard">Mock Dashboard</div>
}));

describe('App', () => {
  it('renders Dashboard', () => {
    render(<App />);
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });
});