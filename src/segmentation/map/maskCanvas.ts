/**
 * The mask in its colours on one canvas, shared by the maps of all views
 *
 * Only the pixels that changed are drawn again, once per animation frame,
 * and then the maps are told to show the canvas again.
 */

import { useSegmentationStore } from '../../stores/segmentationStore';
import { renderMaskRect } from '../mask/palette';
import type { DirtyRect, MaskDocument } from '../mask/MaskDocument';

type Listener = () => void;

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const listeners = new Set<Listener>();
let doc: MaskDocument | null = null;
let dirty: DirtyRect | 'all' | null = null;
let frame: number | null = null;
let unsubscribeDoc: (() => void) | null = null;
let unsubscribeStore: (() => void) | null = null;

function draw() {
  frame = null;
  const rect = dirty;
  dirty = null;
  if (!canvas || !doc || !rect) return;
  if (canvas.width !== doc.width || canvas.height !== doc.height) {
    canvas.width = doc.width;
    canvas.height = doc.height;
  }
  const r = rect === 'all' ? { x: 0, y: 0, width: doc.width, height: doc.height } : rect;
  const ctx = canvas.getContext('2d');
  if (ctx && r.width > 0 && r.height > 0) {
    const { maskType, classes } = useSegmentationStore.getState();
    const data = ctx.createImageData(r.width, r.height);
    renderMaskRect(doc, maskType, classes, r, data.data);
    ctx.putImageData(data, r.x, r.y);
  }
  listeners.forEach((listener) => listener());
}

function invalidate(rect: DirtyRect | 'all') {
  if (rect === 'all' || dirty === 'all' || dirty === null) {
    dirty = rect === 'all' || dirty === 'all' ? 'all' : rect;
  } else {
    const x0 = Math.min(dirty.x, rect.x);
    const y0 = Math.min(dirty.y, rect.y);
    const x1 = Math.max(dirty.x + dirty.width, rect.x + rect.width);
    const y1 = Math.max(dirty.y + dirty.height, rect.y + rect.height);
    dirty = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  if (frame === null) frame = requestAnimationFrame(draw);
}

function bind(next: MaskDocument | null) {
  unsubscribeDoc?.();
  doc = next;
  unsubscribeDoc = doc ? doc.subscribe(invalidate) : null;
  invalidate('all');
}

/**
 * The canvas of the mask, and a function to stop listening. `onChange`
 * runs after each redraw.
 */
export function watchMaskCanvas(onChange: Listener): { canvas: HTMLCanvasElement | null; stop: () => void } {
  if (listeners.size === 0) {
    bind(useSegmentationStore.getState().maskDocument);
    unsubscribeStore = useSegmentationStore.subscribe((s, prev) => {
      if (s.maskDocument !== prev.maskDocument) bind(s.maskDocument);
      else if (s.maskType !== prev.maskType || s.classes !== prev.classes) invalidate('all');
    });
  }
  listeners.add(onChange);
  return {
    canvas,
    stop: () => {
      listeners.delete(onChange);
      if (listeners.size === 0) {
        unsubscribeStore?.();
        unsubscribeStore = null;
        bind(null);
      }
    },
  };
}
