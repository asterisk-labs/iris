import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TooltipLayer from './TooltipLayer';
import { ThemeProvider } from '../contexts/ThemeContext';
import { tooltip } from '../segmentation/input/shortcuts';

const renderPage = () => render(
  <ThemeProvider>
    <button {...tooltip('Draw pixels', 'tool_draw')}>draw</button>
    <button {...tooltip('Brightness', 'brightness_up', 'brightness_down')}>brightness</button>
    <button>plain</button>
    <TooltipLayer />
  </ThemeProvider>
);

const hover = (text: string) => {
  fireEvent.pointerOver(screen.getByText(text));
  act(() => { vi.advanceTimersByTime(200); });
};

describe('TooltipLayer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows what a control does and its shortcut when the mouse is over it', () => {
    vi.useFakeTimers();
    renderPage();

    hover('draw');

    expect(screen.getByRole('tooltip')).toHaveTextContent('Draw pixels');
    expect(screen.getByRole('tooltip').querySelector('kbd')).toHaveTextContent('D');
  });

  it('shows all the keys of a control with several shortcuts', () => {
    vi.useFakeTimers();
    renderPage();

    hover('brightness');

    expect(screen.getByRole('tooltip').querySelector('kbd')).toHaveTextContent('↑ ↓');
  });

  it('hides when the mouse moves to a control without tooltip', () => {
    vi.useFakeTimers();
    renderPage();

    hover('draw');
    fireEvent.pointerOver(screen.getByText('plain'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('follows the label of the control while shown', async () => {
    vi.useFakeTimers();
    renderPage();

    hover('draw');
    await act(async () => { screen.getByText('draw').dataset.tooltip = 'Drawing'; });

    expect(screen.getByRole('tooltip')).toHaveTextContent('Drawing');
  });

  it('hides when clicking', () => {
    vi.useFakeTimers();
    renderPage();

    hover('draw');
    fireEvent.pointerDown(screen.getByText('draw'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
