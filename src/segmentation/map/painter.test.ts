import { describe, it, expect, beforeEach } from 'vitest';
import { continueStroke, endStroke, startStroke } from './painter';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { MaskHistory } from '../mask/history';
import { NO_LABEL } from '../mask/MaskDocument';

const doc = () => useSegmentationStore.getState().maskDocument!;
const painted = () => useSegmentationStore.getState().userPixelCounts.total;

describe('painter', () => {
  beforeEach(() => {
    useSegmentationStore.setState({
      maskDocument: null, maskDimensions: null,
      maskHistory: new MaskHistory(), canUndo: false, canRedo: false,
      currentTool: 'draw', toolSize: 1, currentClass: 1,
    });
    const s = useSegmentationStore.getState();
    s.setImageDimensions(100, 100);
    s.setClasses([
      { name: 'background', colour: [0, 0, 0, 0] },
      { name: 'cloud', colour: [255, 255, 255, 255] },
    ]);
    // The mask covers part of the image
    s.setMaskArea([10, 10, 60, 60]);
    s.setMaskDimensions({ width: 50, height: 50 });
    s.setMasks(new Uint8Array(50 * 50).fill(NO_LABEL), new Uint8Array(50 * 50));
    s.recordHistory();
  });

  it('paints the pixel under the mouse with the current class', () => {
    startStroke([20, 30]);
    endStroke();
    // Image pixel (20, 30) is mask pixel (10, 20)
    expect(doc().final[20 * 50 + 10]).toBe(1);
    expect(painted()).toBe(1);
  });

  it('fills the gap between mouse events in a fast stroke', () => {
    startStroke([10, 10]);
    continueStroke([19, 10]);
    endStroke();
    expect(painted()).toBe(10);
  });

  it('stamps the whole brush and leaves out what is outside the mask', () => {
    useSegmentationStore.setState({ toolSize: 5 });
    startStroke([10, 10]);
    endStroke();
    // Only the quarter of the brush inside the mask area
    expect(painted()).toBe(9);
  });

  it('erases with the eraser', () => {
    startStroke([20, 20]);
    endStroke();
    useSegmentationStore.setState({ currentTool: 'eraser' });
    startStroke([20, 20]);
    endStroke();
    expect(painted()).toBe(0);
    expect(doc().final[10 * 50 + 10]).toBe(NO_LABEL);
  });

  it('does not paint with the move tool, nor after the stroke ended', () => {
    useSegmentationStore.setState({ currentTool: 'move' });
    startStroke([20, 20]);
    continueStroke([21, 20]);
    useSegmentationStore.setState({ currentTool: 'draw' });
    continueStroke([22, 20]);
    expect(painted()).toBe(0);
  });

  it('makes one undo step per stroke, and none for a stroke that changed nothing', () => {
    startStroke([20, 20]);
    continueStroke([25, 20]);
    endStroke();
    startStroke([0, 0]);
    endStroke();

    useSegmentationStore.getState().undo();
    expect(painted()).toBe(0);
    expect(useSegmentationStore.getState().canUndo).toBe(false);
  });
});
