import { render, screen, fireEvent } from '../../../test/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import PaintbrushSelector from './PaintbrushSelector';
import { useSegmentationStore } from '../../../stores/segmentationStore';

const openDropdown = () => fireEvent.click(screen.getByRole('listitem'));

describe('PaintbrushSelector', () => {
  beforeEach(() => {
    useSegmentationStore.setState({ toolShape: 'square', toolSize: 5 });
  });

  it('renders the tool button', () => {
    render(<PaintbrushSelector id="test-brush" icon="/test-icon.png" title="Test Brush" dropdownType="draw" />);
    expect(screen.getByRole('listitem')).toBeInTheDocument();
    expect(screen.queryByText('Select Brush Shape & Size')).not.toBeInTheDocument();
  });

  it('opens the dropdown when clicked, after running onClick', () => {
    const onClick = vi.fn();
    render(<PaintbrushSelector id="test-brush" icon="/test-icon.png" onClick={onClick} dropdownType="draw" />);
    openDropdown();
    expect(onClick).toHaveBeenCalled();
    expect(screen.getByText('Select Brush Shape & Size')).toBeInTheDocument();
    expect(screen.getByText('Square')).toBeInTheDocument();
    expect(screen.getByText('Round')).toBeInTheDocument();
  });

  it('sets the brush shape and size and closes when an option is picked', () => {
    render(<PaintbrushSelector id="test-brush" icon="/test-icon.png" dropdownType="draw" />);
    openDropdown();
    fireEvent.click(screen.getByTitle('Round brush, 10px'));
    expect(useSegmentationStore.getState()).toMatchObject({ toolShape: 'round', toolSize: 10 });
    expect(screen.queryByText('Select Brush Shape & Size')).not.toBeInTheDocument();
  });

  it('highlights the selected brush option', () => {
    useSegmentationStore.setState({ toolShape: 'round', toolSize: 15 });
    render(<PaintbrushSelector id="test-brush" icon="/test-icon.png" dropdownType="draw" />);
    openDropdown();
    expect(screen.getByTitle('Round brush, 15px')).toHaveClass('selected');
  });

  it('keeps the draw and eraser dropdowns independent', () => {
    render(
      <>
        <PaintbrushSelector id="draw" icon="/a.png" dropdownType="draw" />
        <PaintbrushSelector id="eraser" icon="/b.png" dropdownType="eraser" />
      </>,
    );
    fireEvent.click(screen.getAllByRole('listitem')[1]);
    expect(screen.getAllByText('Select Brush Shape & Size')).toHaveLength(1);
  });
});
