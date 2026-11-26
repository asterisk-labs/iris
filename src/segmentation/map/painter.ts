/**
 * Painting with the brush
 *
 * The map views pass the image pixel under the mouse; a stroke stamps the
 * brush along the way from one pixel to the next, so fast strokes have no
 * gaps, and makes one undo step.
 */

import { useSegmentationStore } from '../../stores/segmentationStore';
import { brushPixels, strokePoints } from '../geometry/brush';

type Pixel = [number, number];

let last: Pixel | null = null;
let active = false;
let changed = false;

function stamp(pixel: Pixel) {
  const s = useSegmentationStore.getState();
  const image = s.imageDimensions;
  if (!s.maskDocument || !image || !s.maskArea || !s.maskDimensions) return;
  const visible = { x0: 0, y0: 0, x1: image.width, y1: image.height };
  const pixels = new Set<number>();
  for (const cursor of last ? strokePoints(last, pixel) : [pixel]) {
    for (const i of brushPixels({
      shape: 'square', size: s.toolSize, cursor, maskArea: s.maskArea, maskSize: s.maskDimensions, visible,
    })) pixels.add(i);
  }
  last = pixel;
  if (pixels.size === 0) return;
  s.paintPixels(Array.from(pixels), s.currentTool === 'eraser' ? null : s.currentClass);
  changed = true;
}

export function startStroke(pixel: Pixel): void {
  if (useSegmentationStore.getState().currentTool === 'move') return;
  active = true;
  last = null;
  changed = false;
  stamp(pixel);
}

export function continueStroke(pixel: Pixel): void {
  if (active) stamp(pixel);
}

export function endStroke(): void {
  if (!active) return;
  active = false;
  last = null;
  if (changed) useSegmentationStore.getState().recordHistory();
  changed = false;
}
