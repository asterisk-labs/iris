import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '../../../test/test-utils';
import BrushTool from './BrushTool';
import { BRUSH_SIZES, biggerBrushSize, smallerBrushSize } from '../../../stores/segmentation/toolSlice';
import { useSegmentationStore } from '../../../stores/segmentationStore';
import { handleShortcut } from '../../../segmentation/input/shortcuts';

const renderTools = () => render(
  <>
    <BrushTool tool="draw" id="tb_tool_draw" icon="/pencil.png" title="Draw pixels" />
    <BrushTool tool="eraser" id="tb_tool_eraser" icon="/eraser.png" title="Erase pixels" />
  </>
);

describe('BrushTool', () => {
  beforeEach(() => {
    useSegmentationStore.setState({ currentTool: 'draw', toolSize: 5, brushSizes: { draw: 5, eraser: 5 } });
  });

  it('steps through the brush sizes', () => {
    expect(biggerBrushSize(5)).toBe(8);
    expect(smallerBrushSize(5)).toBe(3);
    expect(biggerBrushSize(4)).toBe(5);
    expect(smallerBrushSize(1)).toBe(1);
    expect(biggerBrushSize(BRUSH_SIZES[BRUSH_SIZES.length - 1])).toBe(100);
  });

  it('makes the brush bigger and smaller', () => {
    renderTools();

    fireEvent.click(screen.getByLabelText('Bigger brush, 5 px now'));
    expect(useSegmentationStore.getState().brushSizes.draw).toBe(8);
    expect(useSegmentationStore.getState().toolSize).toBe(8);

    fireEvent.click(screen.getByLabelText('Smaller brush, 8 px now'));
    expect(useSegmentationStore.getState().brushSizes.draw).toBe(5);
  });

  it('gives the eraser its own size', () => {
    renderTools();

    fireEvent.click(screen.getByLabelText('Bigger eraser, 5 px now'));
    expect(useSegmentationStore.getState().brushSizes).toEqual({ draw: 5, eraser: 8 });
    // The drawing brush is in use and keeps its size
    expect(useSegmentationStore.getState().toolSize).toBe(5);

    useSegmentationStore.getState().setCurrentTool('eraser');
    expect(useSegmentationStore.getState().toolSize).toBe(8);
    useSegmentationStore.getState().setCurrentTool('draw');
    expect(useSegmentationStore.getState().toolSize).toBe(5);
  });

  it('resizes the brush in use with + and -', () => {
    renderTools();

    act(() => { handleShortcut('Equal', '='); });
    expect(useSegmentationStore.getState().brushSizes.draw).toBe(8);
    act(() => { handleShortcut('Minus', '-'); });
    act(() => { handleShortcut('Minus', '-'); });
    expect(useSegmentationStore.getState().brushSizes.draw).toBe(3);
    expect(useSegmentationStore.getState().brushSizes.eraser).toBe(5);
  });

  it('selects its tool', () => {
    renderTools();

    fireEvent.click(document.getElementById('tb_tool_eraser')!);
    expect(useSegmentationStore.getState().currentTool).toBe('eraser');
  });
});
