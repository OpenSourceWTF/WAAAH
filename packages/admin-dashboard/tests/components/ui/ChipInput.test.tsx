import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ChipInput } from '@/components/ui/ChipInput';

describe('ChipInput', () => {
  const defaultSuggestions = ['code-writing', 'test-writing', 'doc-writing', 'spec-writing', 'code-doctor'];

  describe('Rendering', () => {
    it('renders with placeholder when empty', () => {
      render(<ChipInput value={[]} onChange={() => {}} placeholder="Add capability..." />);
      expect(screen.getByPlaceholderText('Add capability...')).toBeInTheDocument();
    });

    it('renders existing chips', () => {
      render(<ChipInput value={['code-writing', 'test-writing']} onChange={() => {}} />);
      expect(screen.getByText('code-writing')).toBeInTheDocument();
      expect(screen.getByText('test-writing')).toBeInTheDocument();
    });

    it('hides placeholder when chips exist', () => {
      render(<ChipInput value={['code-writing']} onChange={() => {}} placeholder="Add..." />);
      const input = screen.getByRole('textbox');
      expect(input).not.toHaveAttribute('placeholder', 'Add...');
    });

    it('renders delete button for each chip', () => {
      render(<ChipInput value={['chip1', 'chip2']} onChange={() => {}} />);
      const removeButtons = screen.getAllByRole('button', { name: /remove/i });
      expect(removeButtons).toHaveLength(2);
    });
  });

  describe('Adding Chips', () => {
    it('adds chip on Enter key', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'new-chip' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['new-chip']);
    });

    it('adds chip on Tab key', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'new-chip' } });
      fireEvent.keyDown(input, { key: 'Tab' });

      expect(onChange).toHaveBeenCalledWith(['new-chip']);
    });

    it('adds chip on comma key', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'new-chip' } });
      fireEvent.keyDown(input, { key: ',' });

      expect(onChange).toHaveBeenCalledWith(['new-chip']);
    });

    it('clears input after adding chip', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'new-chip' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input).toHaveValue('');
    });

    it('does not add empty chip', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('trims whitespace from chip', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: '  new-chip  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['new-chip']);
    });
  });

  describe('Removing Chips', () => {
    it('removes chip when X button clicked', () => {
      const onChange = vi.fn();
      render(<ChipInput value={['chip1', 'chip2']} onChange={onChange} />);

      const removeButton = screen.getByRole('button', { name: 'Remove chip1' });
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(['chip2']);
    });

    it('removes last chip on Backspace when input is empty', () => {
      const onChange = vi.fn();
      render(<ChipInput value={['chip1', 'chip2']} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onChange).toHaveBeenCalledWith(['chip1']);
    });

    it('does not remove chip on Backspace when input has value', () => {
      const onChange = vi.fn();
      render(<ChipInput value={['chip1']} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'typing' } });
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Duplicate Prevention', () => {
    it('does not add duplicate chip', () => {
      const onChange = vi.fn();
      render(<ChipInput value={['existing-chip']} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'existing-chip' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('flashes existing chip when duplicate entered', async () => {
      vi.useFakeTimers();
      render(<ChipInput value={['existing-chip']} onChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'existing-chip' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Check that the chip has the flash class
      const chip = screen.getByText('existing-chip').closest('span');
      expect(chip).toHaveClass('animate-pulse');

      // Flash should be removed after timeout - wrap in act for React state update
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(chip).not.toHaveClass('animate-pulse');

      vi.useRealTimers();
    });

    it('clears input after duplicate attempt', () => {
      render(<ChipInput value={['existing-chip']} onChange={() => {}} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'existing-chip' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(input).toHaveValue('');
    });
  });

  describe('Autocomplete Suggestions', () => {
    it('shows suggestions on focus', () => {
      render(<ChipInput value={[]} onChange={() => {}} suggestions={defaultSuggestions} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      expect(screen.getByText('code-writing')).toBeInTheDocument();
      expect(screen.getByText('test-writing')).toBeInTheDocument();
    });

    it('filters suggestions based on input', () => {
      render(<ChipInput value={[]} onChange={() => {}} suggestions={defaultSuggestions} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'doc' } });

      expect(screen.getByText('doc-writing')).toBeInTheDocument();
      expect(screen.queryByText('code-writing')).not.toBeInTheDocument();
    });

    it('excludes already selected chips from suggestions', () => {
      render(<ChipInput value={['code-writing']} onChange={() => {}} suggestions={defaultSuggestions} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      expect(screen.queryByRole('button', { name: 'code-writing' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'test-writing' })).toBeInTheDocument();
    });

    it('adds chip when suggestion clicked', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} suggestions={defaultSuggestions} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      const suggestion = screen.getByRole('button', { name: 'code-writing' });
      fireEvent.click(suggestion);

      expect(onChange).toHaveBeenCalledWith(['code-writing']);
    });

    it('hides suggestions on Escape key', () => {
      render(<ChipInput value={[]} onChange={() => {}} suggestions={defaultSuggestions} />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      expect(screen.getByText('code-writing')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByText('code-writing')).not.toBeInTheDocument();
    });

    it('hides suggestions when clicking outside', () => {
      render(
        <div>
          <ChipInput value={[]} onChange={() => {}} suggestions={defaultSuggestions} />
          <button data-testid="outside">Outside</button>
        </div>
      );

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      expect(screen.getByText('code-writing')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside'));
      expect(screen.queryByText('code-writing')).not.toBeInTheDocument();
    });

    it('allows custom strings not in suggestions', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} suggestions={defaultSuggestions} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'custom-capability' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onChange).toHaveBeenCalledWith(['custom-capability']);
    });
  });

  describe('Disabled State', () => {
    it('disables input when disabled prop is true', () => {
      render(<ChipInput value={['chip1']} onChange={() => {}} disabled />);

      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('hides remove buttons when disabled', () => {
      render(<ChipInput value={['chip1']} onChange={() => {}} disabled />);

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });

    it('does not show suggestions when disabled', () => {
      render(<ChipInput value={[]} onChange={() => {}} suggestions={defaultSuggestions} disabled />);

      const input = screen.getByRole('textbox');
      fireEvent.focus(input);

      expect(screen.queryByText('code-writing')).not.toBeInTheDocument();
    });
  });

  describe('Comma Handling', () => {
    it('splits input on comma and adds chips', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.change(input, { target: { value: 'chip1,' } });

      expect(onChange).toHaveBeenCalledWith(['chip1']);
    });

    it('handles multiple commas in pasted content', () => {
      const onChange = vi.fn();
      render(<ChipInput value={[]} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      // Simulate typing/pasting "chip1,chip2,"
      fireEvent.change(input, { target: { value: 'chip1,chip2,' } });

      // First call adds 'chip1', second call adds 'chip2'
      expect(onChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('Focus Behavior', () => {
    it('focuses input when container clicked', () => {
      render(<ChipInput value={['chip1']} onChange={() => {}} />);

      const container = screen.getByText('chip1').closest('div[class*="flex-wrap"]');
      fireEvent.click(container!);

      expect(screen.getByRole('textbox')).toHaveFocus();
    });
  });
});
