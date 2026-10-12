import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CanvasController, ViewportCanvases } from './CanvasController';
import { useSegmentationStore } from '../../stores/segmentationStore';
import { useViewManagerStore } from '../../stores/viewManagerStore';

/** A 2D context that records calls, enough for the controller's drawing. */
function recordingContext() {
  const calls: Array<[string, unknown[]]> = [];
  const record = (name: string) => (...args: unknown[]) => { calls.push([name, args]); };
  const ctx: Record<string, unknown> = { calls, imageSmoothingEnabled: true };
  for (const name of ['setTransform', 'clearRect', 'drawImage', 'fillRect', 'arc', 'fill', 'beginPath', 'rect', 'stroke', 'setLineDash', 'putImageData']) {
    ctx[name] = record(name);
  }
  ctx.createImageData = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
  return ctx as Record<string, unknown> & { calls: Array<[string, unknown[]]> };
}

const RECT = { left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) };

function makeViewport() {
  const container = document.createElement('div');
  container.getBoundingClientRect = () => RECT as DOMRect;
  const make = () => {
    const canvas = document.createElement('canvas');
    const ctx = recordingContext();
    canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
    canvas.getBoundingClientRect = () => RECT as DOMRect;
    return canvas;
  };
  const canvases: ViewportCanvases = { rgb: make(), mask: make(), preview: make() };
  container.append(canvases.rgb, canvases.mask, canvases.preview);
  return { container, canvases };
}

const pointer = (type: string, x: number, y: number, buttons: number) =>
  new MouseEvent(type, { clientX: x, clientY: y, buttons, bubbles: true });

const userPixels = () => {
  const u = useSegmentationStore.getState().userMaskData!;
  return Array.from(u).reduce((n, v) => n + v, 0);
};

describe('CanvasController', () => {
  let controller: CanvasController;
  let vp: ReturnType<typeof makeViewport>;

  beforeEach(() => {
    useViewManagerStore.setState({ viewTransform: null, views: { rgb: { name: 'rgb', type: 'image', description: '' } } });
    useViewManagerStore.getState().setImageDimensions(100, 100);
    useSegmentationStore.setState({
      maskDocument: null, maskData: null, userMaskData: null, maskDimensions: null,
      maskHistory: [], userMaskHistory: [], historyCurrentEpoch: 0,
      currentTool: 'draw', toolSize: 1, toolShape: 'square', currentClass: 1,
      showMask: true, maskType: 'final',
    });
    const s = useSegmentationStore.getState();
    s.setClasses([
      { name: 'background', colour: [0, 0, 0, 0] },
      { name: 'cloud', colour: [255, 255, 255, 255] },
    ]);
    s.setMaskArea([0, 0, 100, 100]);
    s.setMaskData(new Uint8Array(100 * 100), 100, 100);
    s.setUserMaskData(new Uint8Array(100 * 100));
    s.updateHistory();

    controller = new CanvasController();
    vp = makeViewport();
    controller.attachViewport('v', vp.container, vp.canvases);
  });

  afterEach(() => {
    controller.detachViewport('v');
  });

  it('sizes the canvases to the container, keeping the image aspect', () => {
    expect(vp.canvases.rgb.width).toBe(200);
    expect(vp.canvases.preview.height).toBe(200);
  });

  it('paints the pixel under the pointer with the current class', () => {
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    const { maskData, userMaskData } = useSegmentationStore.getState();
    expect(maskData![25 * 100 + 25]).toBe(1);
    expect(userMaskData![25 * 100 + 25]).toBe(1);
    expect(userPixels()).toBe(1);
  });

  it('fills the gap between pointer events in a fast stroke', () => {
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    vp.canvases.preview.dispatchEvent(pointer('pointermove', 90, 50, 1));
    const { userMaskData } = useSegmentationStore.getState();
    for (let x = 25; x <= 45; x++) expect(userMaskData![25 * 100 + x]).toBe(1);
    expect(userPixels()).toBe(21);
  });

  it('erases with the eraser tool', () => {
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    useSegmentationStore.setState({ currentTool: 'eraser' });
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    expect(userPixels()).toBe(0);
  });

  it('records one undo entry per stroke, and none for a click that changes nothing', () => {
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    vp.canvases.preview.dispatchEvent(pointer('pointermove', 60, 50, 1));
    vp.canvases.preview.dispatchEvent(pointer('pointerup', 60, 50, 0));
    expect(useSegmentationStore.getState().maskHistory).toHaveLength(2);
    // Right-button click: pans, no paint, no history entry
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 2));
    vp.canvases.preview.dispatchEvent(pointer('pointerup', 50, 50, 0));
    expect(useSegmentationStore.getState().maskHistory).toHaveLength(2);
    useSegmentationStore.getState().undo();
    expect(userPixels()).toBe(0);
  });

  it('zooms about the cursor with the wheel', () => {
    vp.canvases.preview.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100 }));
    const t = useViewManagerStore.getState().viewTransform!;
    expect(t.zoom).toBeCloseTo(1.1);
    expect(t.originX).toBeCloseTo(50 + (0 - 50) / 1.1);
  });

  it('resizes the brush with Shift+wheel (which browsers report as horizontal)', () => {
    useSegmentationStore.setState({ toolSize: 10 });
    vp.canvases.preview.dispatchEvent(new WheelEvent('wheel', { deltaX: -100, shiftKey: true, clientX: 100, clientY: 100 }));
    expect(useSegmentationStore.getState().toolSize).toBe(15);
    expect(useViewManagerStore.getState().viewTransform).toBeNull();
  });

  it('pans by dragging with the move tool', () => {
    vp.canvases.preview.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100 }));
    vp.canvases.preview.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100 }));
    const before = useViewManagerStore.getState().viewTransform!;
    useSegmentationStore.setState({ currentTool: 'move' });
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 100, 100, 1));
    vp.canvases.preview.dispatchEvent(pointer('pointermove', 80, 100, 1));
    const after = useViewManagerStore.getState().viewTransform!;
    expect(after.originX).toBeGreaterThan(before.originX);
    expect(after.originY).toBeCloseTo(before.originY);
    expect(userPixels()).toBe(0);
  });

  it('takes a reset of the stored transform as a reset of the view', () => {
    vp.canvases.preview.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100 }));
    useViewManagerStore.getState().resetCanvas();
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    expect(useSegmentationStore.getState().userMaskData![25 * 100 + 25]).toBe(1);
  });

  it('draws the image, mask and preview with the view transform', () => {
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: true });
    controller.setImage('v', image);
    controller.render();
    const rgb = (vp.canvases.rgb.getContext('2d') as unknown as ReturnType<typeof recordingContext>).calls;
    const mask = (vp.canvases.mask.getContext('2d') as unknown as ReturnType<typeof recordingContext>).calls;
    expect(rgb).toContainEqual(['setTransform', [2, 0, 0, 2, -0, -0]]);
    expect(rgb.find(c => c[0] === 'drawImage')?.[1].slice(1)).toEqual([0, 0, 100, 100]);
    expect(mask.find(c => c[0] === 'drawImage')?.[1].slice(1)).toEqual([0, 0]);
  });

  it('hides the mask canvas when the mask is toggled off and applies filters as CSS', () => {
    useSegmentationStore.getState().setShowMask(false);
    expect(vp.canvases.mask.style.display).toBe('none');
    useSegmentationStore.getState().setBrightness(150);
    expect(vp.canvases.rgb.style.filter).toBe('brightness(150%) saturate(100%)');
    useSegmentationStore.getState().resetFilters();
    expect(vp.canvases.rgb.style.filter).toBe('brightness(100%) saturate(100%)');
  });

  it('stops listening when the last viewport detaches', () => {
    const spy = vi.spyOn(useSegmentationStore.getState(), 'paintPixels');
    controller.detachViewport('v');
    vp.canvases.preview.dispatchEvent(pointer('pointerdown', 50, 50, 1));
    expect(spy).not.toHaveBeenCalled();
    controller.attachViewport('v', vp.container, vp.canvases);
  });
});
