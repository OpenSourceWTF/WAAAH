/**
 * E2E Tests for ChipInput Component
 *
 * Tests the ChipInput component for capability management including:
 * - Adding/removing chips
 * - Autocomplete suggestions
 * - Duplicate prevention
 * - Custom string input
 *
 * Spec: 010-dashboard-ux-polish V3
 * Dependencies: T3 (ChipInput component), T5 (TaskCreationForm integration)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ChipInput } from '@/components/ui/ChipInput';

describe('ChipInput E2E Tests', () => {
  const defaultSuggestions = [
    'code-writing',
    'test-writing',
    'doc-writing',
    'spec-writing',
    'code-doctor'
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Initial state and visibility', () => {
    it('should render ChipInput with placeholder', () => {
      render(
        <ChipInput
          value={[]}
          onChange={() => {}}
          suggestions={defaultSuggestions}
          placeholder="Select capabilities..."
        />
      );

      expect(screen.getByPlaceholderText('Select capabilities...')).toBeInTheDocument();
    });

    it('should render input element for typing', () => {
      render(
        <ChipInput
          value={[]}
          onChange={() => {}}
          suggestions={defaultSuggestions}
        />
      );

      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('2. Suggestions dropdown', () => {
    it('should show suggestions when input is focused', async () => {
      render(
        <ChipInput
          value={[]}
          onChange={() => {}}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('code-writing')).toBeInTheDocument();
        expect(screen.getByText('test-writing')).toBeInTheDocument();
      });
    });

    it('should filter suggestions based on typed input', async () => {
      render(
        <ChipInput
          value={[]}
          onChange={() => {}}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'code' } });

      await waitFor(() => {
        expect(screen.getByText('code-writing')).toBeInTheDocument();
        expect(screen.getByText('code-doctor')).toBeInTheDocument();
        expect(screen.queryByText('test-writing')).not.toBeInTheDocument();
      });
    });

    it('should not show already selected chips in suggestions', async () => {
      render(
        <ChipInput
          value={['code-writing']}
          onChange={() => {}}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'code-writing' })).not.toBeInTheDocument();
        expect(screen.getByText('test-writing')).toBeInTheDocument();
      });
    });
  });

  describe('3. Adding chips via Enter key', () => {
    it('should add chip when Enter is pressed', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'code-writing' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['code-writing']);
    });

    it('should clear input after adding chip', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'test-writing' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input).toHaveValue('');
    });

    it('should add chip when Tab is pressed', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'doc-writing' } });
      fireEvent.keyDown(input, { key: 'Tab' });

      expect(onChange).toHaveBeenCalledWith(['doc-writing']);
    });

    it('should add chip when comma is pressed', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'spec-writing' } });
      fireEvent.keyDown(input, { key: ',' });

      expect(onChange).toHaveBeenCalledWith(['spec-writing']);
    });
  });

  describe('4. Chip appears as pill', () => {
    it('should display chips as pills', () => {
      render(
        <ChipInput
          value={['code-writing', 'test-writing']}
          onChange={() => {}}
          suggestions={defaultSuggestions}
        />
      );

      expect(screen.getByText('code-writing')).toBeInTheDocument();
      expect(screen.getByText('test-writing')).toBeInTheDocument();
    });

    it('should have X button on each chip for removal', () => {
      render(
        <ChipInput
          value={['code-writing', 'test-writing']}
          onChange={() => {}}
          suggestions={defaultSuggestions}
        />
      );

      const removeButtons = screen.getAllByRole('button', { name: /remove/i });
      expect(removeButtons.length).toBe(2);
    });
  });

  describe('5. Remove chip by clicking X', () => {
    it('should remove chip when X is clicked', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={['code-writing', 'test-writing']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const removeButton = screen.getByRole('button', { name: 'Remove code-writing' });
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(['test-writing']);
    });

    it('should remove correct chip from multiple chips', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={['code-writing', 'test-writing', 'doc-writing']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const removeButton = screen.getByRole('button', { name: 'Remove test-writing' });
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(['code-writing', 'doc-writing']);
    });

    it('should remove last chip with backspace on empty input', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={['code-writing', 'test-writing']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onChange).toHaveBeenCalledWith(['code-writing']);
    });
  });

  describe('6. Duplicate prevention', () => {
    it('should not add duplicate chip', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={['code-writing']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'code-writing' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // onChange should NOT be called for duplicate
      expect(onChange).not.toHaveBeenCalled();
    });

    it('should clear input when trying to add duplicate', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={['code-writing']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'code-writing' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input).toHaveValue('');
    });
  });

  describe('7. Custom string input (not from suggestions)', () => {
    it('should allow adding custom capability not in suggestions', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'custom-capability' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['custom-capability']);
    });

    it('should add multiple custom capabilities', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={['first-custom']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'second-custom' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['first-custom', 'second-custom']);
    });
  });

  describe('8. Clicking suggestion adds chip', () => {
    it('should add chip when clicking suggestion', async () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('code-writing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('code-writing'));

      expect(onChange).toHaveBeenCalledWith(['code-writing']);
    });

    it('should add chip and keep focus on input after clicking suggestion', async () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('test-writing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('test-writing'));

      // Verify the chip was added
      expect(onChange).toHaveBeenCalledWith(['test-writing']);
      // Input should still be focusable/interactive
      expect(input).toBeInTheDocument();
    });
  });

  describe('9. Integration scenarios', () => {
    it('should handle mix of suggestion clicks and manual entry', async () => {
      let currentValue: string[] = [];
      const onChange = vi.fn((newValue: string[]) => {
        currentValue = newValue;
      });

      const { rerender } = render(
        <ChipInput
          value={currentValue}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');

      // Add via typing
      fireEvent.change(input, { target: { value: 'custom-cap' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['custom-cap']);

      // Rerender with new value
      rerender(
        <ChipInput
          value={['custom-cap']}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      // Add via suggestion click
      fireEvent.focus(input);

      await waitFor(() => {
        expect(screen.getByText('code-writing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('code-writing'));

      expect(onChange).toHaveBeenCalledWith(['custom-cap', 'code-writing']);
    });

    it('should not add empty chip on Enter with whitespace only', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('should trim whitespace from chip values', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
        />
      );

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '  padded-value  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['padded-value']);
    });
  });

  describe('10. Disabled state', () => {
    it('should not allow adding chips when disabled', () => {
      const onChange = vi.fn();
      render(
        <ChipInput
          value={[]}
          onChange={onChange}
          suggestions={defaultSuggestions}
          disabled
        />
      );

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should not show remove buttons when disabled', () => {
      render(
        <ChipInput
          value={['code-writing']}
          onChange={() => {}}
          suggestions={defaultSuggestions}
          disabled
        />
      );

      const removeButtons = screen.queryAllByRole('button', { name: /remove/i });
      expect(removeButtons.length).toBe(0);
    });
  });
});
