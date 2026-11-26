import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '../../test/test-utils';
import RightPanel from './RightPanel';
import { handleShortcut } from '../../segmentation/input/shortcuts';

const renderPanel = () => render(
  <RightPanel expanded onToggle={vi.fn()} onSelectClass={vi.fn()} />
);

describe('RightPanel sections', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('folds a section from its title and remembers it', () => {
    const { unmount } = renderPanel();
    expect(screen.getByText('Brightness')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /adjustments/i }));
    expect(screen.queryByText('Brightness')).not.toBeInTheDocument();

    unmount();
    renderPanel();
    expect(screen.queryByText('Brightness')).not.toBeInTheDocument();
  });

  it('folds the layers with their shortcut', () => {
    renderPanel();
    expect(screen.getByText('Show Mask')).toBeInTheDocument();

    act(() => { handleShortcut('KeyL', 'l'); });
    expect(screen.queryByText('Show Mask')).not.toBeInTheDocument();
  });

  it('shows the shortcut of a layer over its name too', () => {
    renderPanel();
    const shortcutOf = (name: string) => screen.getByText(name).closest('[data-tooltip]')?.getAttribute('data-shortcut');
    expect(shortcutOf('Show Mask')).toBe('Space');
    expect(shortcutOf('Image')).toBe('P');
    expect(shortcutOf('Satellite')).toBe('M');
  });
});
