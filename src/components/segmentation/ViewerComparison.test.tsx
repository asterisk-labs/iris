import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ViewerComparison from './ViewerComparison';
import { useSegmentationStore } from '../../stores/segmentationStore';
import type { ProjectConfig } from '../../types/iris';

vi.mock('./ReactViewManager', () => ({
  default: () => <div data-testid="react-view-manager">React ViewManager</div>,
}));

vi.mock('./ErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ViewerComparison', () => {
  beforeEach(() => {
    useSegmentationStore.setState({ config: null });
  });

  it('shows a loading message until the config has loaded', () => {
    render(<ViewerComparison />);
    expect(screen.getByText('Loading configuration...')).toBeInTheDocument();
    expect(screen.queryByTestId('react-view-manager')).not.toBeInTheDocument();
  });

  it('renders the view manager once the config has loaded', () => {
    render(<ViewerComparison />);
    act(() => useSegmentationStore.setState({ config: {} as ProjectConfig }));
    expect(screen.getByTestId('react-view-manager')).toBeInTheDocument();
  });

  it('fills the available space', () => {
    const { container } = render(<ViewerComparison />);
    expect(container.firstChild).toHaveStyle({ width: '100%', height: '100%', overflow: 'hidden' });
  });
});
