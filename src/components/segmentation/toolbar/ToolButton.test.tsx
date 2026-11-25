import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../../test/test-utils';
import ToolButton from './ToolButton';

describe('ToolButton', () => {
  it('renders with icon and calls onClick', () => {
    const handleClick = vi.fn();
    render(
      <ToolButton
        icon="/test-icon.png"
        onClick={handleClick}
        testId="test-button"
      />
    );

    const button = screen.getByTestId('test-button');
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows its title and the shortcut of its id in the tooltip', () => {
    render(
      <ToolButton
        id="tb_undo"
        icon="/test-icon.png"
        onClick={vi.fn()}
        title="Undo"
        testId="test-button"
      />
    );

    const button = screen.getByTestId('test-button');
    expect(button).toHaveAttribute('data-tooltip', 'Undo');
    expect(button).toHaveAttribute('data-shortcut', 'U');
    expect(button).toHaveAttribute('aria-label', 'Undo');
  });
});
