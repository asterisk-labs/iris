import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ReactViewManager from './ReactViewManager';

describe('ReactViewManager', () => {
  it('renders no views message when no views configured', () => {
    render(<ReactViewManager />);
    expect(screen.getByText('No views configured or image not loaded')).toBeInTheDocument();
  });

  it('renders with basic props', () => {
    const { container } = render(<ReactViewManager className="test-class" />);
    expect(container.firstChild).toHaveClass('react-view-manager test-class');
  });
});