/**
 * Draws the view canvases and turns pointer input into painting, panning
 * and zooming.
 *
 * Each viewport registers three stacked canvases (image, mask, preview).
 * All viewports share one zoom/pan transform, held in the view store so it
 * survives remounts. Rendering is imperative and batched to one pass per
 * animation frame; React does not re-render per stroke.
 *
 * The controller reads state from the stores and changes it only through
 * store actions. The stores do not know about the controller.
 */

import { useSegmentationStore } from '../../stores/segmentationStore';
import { brushOffset, brushPixels, strokePoints, Size } from '../geometry/brush';
import {
  ViewTransform, orFit, toMatrix, zoomAt, panBy, visibleRect,
  clientToCanvasPixel, canvasPixelToImagePixel,
} from '../geometry/transform';
import { renderMaskRect } from '../mask/palette';
import type { DirtyRect, MaskDocument } from '../mask/MaskDocument';

export interface ViewportCanvases {
  rgb: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  preview: HTMLCanvasElement;
}

interface Viewport extends ViewportCanvases {
  id: string;
  container: HTMLElement;
  image: HTMLImageElement | null;
  observer: ResizeObserver | null;
  detachInput: () => void;
}

type Point = [number, number];

/** Mouse buttons that pan the view: right or middle, or left with the move tool. */
const isPanButtons = (buttons: number, tool: string) =>
  buttons === 2 || buttons === 4 || (buttons === 1 && tool === 'move');

export class CanvasController {
  private viewports = new Map<string, Viewport>();
  private transform: ViewTransform | null = null;

  /** Cursor position in image pixels, shared by all viewports. */
  private cursor: Point = [0, 0];
  /** Last pointer position in canvas pixels, and on which viewport. */
  private pointer: { viewport: string; canvas: Point } | null = null;
  private dragStart: Point | null = null;
  private lastStamp: Point | null = null;
  private strokeChanged = false;

  private offscreen: HTMLCanvasElement | null = null;
  private doc: MaskDocument | null = null;
  private unsubscribeDoc: (() => void) | null = null;
  private unsubscribeStores: Array<() => void> = [];

  private frame: number | null = null;
  private dirty = { rgb: false, mask: false, preview: false, offscreen: null as DirtyRect | 'all' | null };

  // ---- Viewports -----------------------------------------------------------

  attachViewport(id: string, container: HTMLElement, canvases: ViewportCanvases): void {
    if (this.viewports.size === 0) this.start();
    const viewport: Viewport = { id, container, ...canvases, image: null, observer: null, detachInput: () => {} };
    for (const canvas of [canvases.rgb, canvases.mask, canvases.preview]) {
      canvas.classList.add('view-canvas');
    }
    canvases.mask.classList.add('mask-canvas');
    canvases.preview.classList.add('preview-canvas');
    viewport.detachInput = this.attachInput(viewport);
    if (typeof ResizeObserver !== 'undefined') {
      viewport.observer = new ResizeObserver(() => this.layout(viewport));
      viewport.observer.observe(container);
    }
    this.viewports.set(id, viewport);
    this.layout(viewport);
    this.applyFilters();
    this.applyMaskVisibility();
  }

  detachViewport(id: string): void {
    const viewport = this.viewports.get(id);
    if (!viewport) return;
    viewport.observer?.disconnect();
    viewport.detachInput();
    this.viewports.delete(id);
    if (this.pointer?.viewport === id) this.pointer = null;
    if (this.viewports.size === 0) this.stop();
  }

  /** Image to draw in a viewport, once it has loaded. */
  setImage(id: string, image: HTMLImageElement | null): void {
    const viewport = this.viewports.get(id);
    if (!viewport) return;
    viewport.image = image;
    this.invalidate({ rgb: true });
  }

  // ---- Store wiring ---------------------------------------------------------

  private start() {
    this.transform = useSegmentationStore.getState().viewTransform;
    this.bindDocument(useSegmentationStore.getState().maskDocument);

    this.unsubscribeStores.push(useSegmentationStore.subscribe((s, prev) => {
      if (s.maskDocument !== prev.maskDocument) this.bindDocument(s.maskDocument);
      if (s.maskType !== prev.maskType || s.classes !== prev.classes) this.invalidateMask('all');
      if (s.showMask !== prev.showMask) this.applyMaskVisibility();
      if (s.toolSize !== prev.toolSize || s.toolShape !== prev.toolShape || s.maskArea !== prev.maskArea) {
        this.invalidate({ preview: true, mask: true });
      }
      if (s.brightness !== prev.brightness || s.saturation !== prev.saturation ||
          s.contrast !== prev.contrast || s.invert !== prev.invert) {
        this.applyFilters();
      }
    }));

    this.unsubscribeStores.push(useSegmentationStore.subscribe((s, prev) => {
      if (s.viewTransform !== prev.viewTransform && s.viewTransform !== this.transform) {
        // Changed from outside (e.g. reset view)
        this.transform = s.viewTransform;
        this.refreshCursor();
        this.invalidate({ rgb: true, mask: true, preview: true });
      }
      if (s.imageDimensions !== prev.imageDimensions) {
        this.viewports.forEach(v => this.layout(v));
      }
    }));
  }

  private stop() {
    this.unsubscribeStores.forEach(u => u());
    this.unsubscribeStores = [];
    this.bindDocument(null);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private bindDocument(doc: MaskDocument | null) {
    this.unsubscribeDoc?.();
    this.unsubscribeDoc = null;
    this.doc = doc;
    if (doc) {
      this.unsubscribeDoc = doc.subscribe(rect => this.invalidateMask(rect));
    }
    this.invalidateMask('all');
  }

  // ---- Geometry helpers ------------------------------------------------------

  private imageSize(): Size | null {
    return useSegmentationStore.getState().imageDimensions;
  }

  private canvasSize(v: Viewport): Size {
    return { width: v.rgb.width, height: v.rgb.height };
  }

  private currentTransform(): ViewTransform {
    return orFit(this.transform);
  }

  private setTransform(t: ViewTransform) {
    this.transform = t;
    useSegmentationStore.getState().setViewTransform(t);
    this.invalidate({ rgb: true, mask: true, preview: true });
  }

  /** Size the canvases of a viewport to fit its container, keeping the image aspect. */
  private layout(v: Viewport) {
    const image = this.imageSize();
    const rect = v.container.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;
    if (image && width > 0 && height > 0) {
      const aspect = image.width / image.height;
      if (width / height > aspect) width = height * aspect;
      else height = width / aspect;
    }
    for (const canvas of [v.rgb, v.mask, v.preview]) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.position = 'absolute';
      canvas.style.left = `${(rect.width - width) / 2}px`;
      canvas.style.top = `${(rect.height - height) / 2}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    this.invalidate({ rgb: true, mask: true, preview: true });
  }

  /** Recompute the cursor's image position after the transform changed. */
  private refreshCursor() {
    const image = this.imageSize();
    const v = this.pointer && this.viewports.get(this.pointer.viewport);
    if (!image || !v || !this.pointer) return;
    this.cursor = canvasPixelToImagePixel(this.currentTransform(), this.canvasSize(v), image, this.pointer.canvas);
  }

  // ---- Input ----------------------------------------------------------------

  private attachInput(v: Viewport): () => void {
    const target = v.preview;
    const onDown = (e: PointerEvent) => this.onPointerDown(v, e);
    const onMove = (e: PointerEvent) => this.onPointerMove(v, e);
    const onUp = (e: PointerEvent) => this.onPointerUp(v, e);
    const onEnter = (e: PointerEvent) => this.onPointerEnter(v, e);
    const onWheel = (e: WheelEvent) => this.onWheel(v, e);
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
    target.addEventListener('pointerenter', onEnter);
    target.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      target.removeEventListener('pointerenter', onEnter);
      target.removeEventListener('wheel', onWheel);
    };
  }

  /** Update the cursor from a pointer event; returns false if the image size is unknown. */
  private track(v: Viewport, e: MouseEvent): boolean {
    const image = this.imageSize();
    if (!image) return false;
    const rect = v.preview.getBoundingClientRect();
    const canvasPx = clientToCanvasPixel([e.clientX, e.clientY], rect, this.canvasSize(v));
    this.pointer = { viewport: v.id, canvas: canvasPx };
    this.cursor = canvasPixelToImagePixel(this.currentTransform(), this.canvasSize(v), image, canvasPx);
    return true;
  }

  private onPointerDown(v: Viewport, e: PointerEvent) {
    if (!this.track(v, e)) return;
    const tool = useSegmentationStore.getState().currentTool;
    v.preview.setPointerCapture?.(e.pointerId);
    if (e.buttons === 1 && tool !== 'move') {
      this.lastStamp = null;
      this.strokeChanged = false;
      this.stamp(v);
      this.dragStart = null;
    } else if (isPanButtons(e.buttons, tool)) {
      this.dragStart = [...this.cursor];
    }
    this.invalidate({ preview: true });
  }

  private onPointerMove(v: Viewport, e: PointerEvent) {
    if (!this.track(v, e)) return;
    const tool = useSegmentationStore.getState().currentTool;
    if (isPanButtons(e.buttons, tool) && this.dragStart) {
      const image = this.imageSize()!;
      const dx = this.cursor[0] - this.dragStart[0];
      const dy = this.cursor[1] - this.dragStart[1];
      if (dx !== 0 || dy !== 0) {
        this.setTransform(panBy(this.currentTransform(), image, dx, dy));
        this.refreshCursor();
      }
    }
    if (e.buttons === 1 && tool !== 'move') {
      this.stamp(v);
    }
    this.invalidate({ preview: true });
  }

  private onPointerUp(v: Viewport, e: PointerEvent) {
    v.preview.releasePointerCapture?.(e.pointerId);
    this.dragStart = null;
    this.lastStamp = null;
    if (this.strokeChanged) {
      // One undo entry per stroke
      useSegmentationStore.getState().recordHistory();
      this.strokeChanged = false;
    }
  }

  private onPointerEnter(v: Viewport, e: PointerEvent) {
    if (!this.track(v, e)) return;
    if (isPanButtons(e.buttons, useSegmentationStore.getState().currentTool)) {
      this.dragStart = [...this.cursor];
    }
    this.invalidate({ preview: true });
  }

  private onWheel(v: Viewport, e: WheelEvent) {
    // Browsers turn Shift+wheel into horizontal scrolling, so fall back to deltaX
    const delta = -Math.sign(e.deltaY || e.deltaX);
    if (delta === 0 || !this.track(v, e)) return;
    const s = useSegmentationStore.getState();
    if (e.shiftKey) {
      const mask = s.maskDimensions;
      const limit = mask ? Math.max(mask.width, mask.height) : 100;
      const size = s.toolSize + delta * 0.5 * s.toolSize;
      s.setToolSize(Math.round(Math.max(1, Math.min(size, limit))));
      return;
    }
    const image = this.imageSize()!;
    this.setTransform(zoomAt(this.currentTransform(), image, Math.pow(1.1, delta), this.cursor));
    this.refreshCursor();
  }

  /** Paint or erase along the pointer's path since the last stamp. */
  private stamp(v: Viewport) {
    const s = useSegmentationStore.getState();
    const image = this.imageSize();
    if (!this.doc || !image || !s.maskArea || !s.maskDimensions) return;
    const visible = visibleRect(this.currentTransform(), this.canvasSize(v), image);
    const points = this.lastStamp ? strokePoints(this.lastStamp, this.cursor) : [this.cursor];
    const pixels = new Set<number>();
    for (const cursor of points) {
      for (const i of brushPixels({
        shape: s.toolShape, size: s.toolSize, cursor, maskArea: s.maskArea, maskSize: s.maskDimensions, visible,
      })) pixels.add(i);
    }
    this.lastStamp = [...this.cursor];
    if (pixels.size === 0) return;
    s.paintPixels(Array.from(pixels), s.currentTool === 'eraser' ? null : s.currentClass);
    this.strokeChanged = true;
  }

  // ---- Rendering --------------------------------------------------------------

  private invalidate(parts: { rgb?: boolean; mask?: boolean; preview?: boolean }) {
    if (parts.rgb) this.dirty.rgb = true;
    if (parts.mask) this.dirty.mask = true;
    if (parts.preview) this.dirty.preview = true;
    this.schedule();
  }

  private invalidateMask(rect: DirtyRect | 'all') {
    const current = this.dirty.offscreen;
    if (rect === 'all' || current === 'all') {
      this.dirty.offscreen = 'all';
    } else if (current === null) {
      this.dirty.offscreen = rect;
    } else {
      const x0 = Math.min(current.x, rect.x);
      const y0 = Math.min(current.y, rect.y);
      const x1 = Math.max(current.x + current.width, rect.x + rect.width);
      const y1 = Math.max(current.y + current.height, rect.y + rect.height);
      this.dirty.offscreen = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
    this.dirty.mask = true;
    this.schedule();
  }

  private schedule() {
    if (this.frame !== null || this.viewports.size === 0) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  /** Draw everything that is out of date. Exposed for tests. */
  render(): void {
    const image = this.imageSize();
    if (!image) return;
    const { rgb, mask, preview, offscreen } = this.dirty;
    this.dirty = { rgb: false, mask: false, preview: false, offscreen: null };
    if (offscreen) this.updateOffscreen(offscreen);
    for (const v of this.viewports.values()) {
      if (v.rgb.width === 0 || v.rgb.height === 0) continue;
      const matrix = toMatrix(this.currentTransform(), this.canvasSize(v), image);
      if (rgb) this.drawImage(v, matrix, image);
      if (mask) this.drawMask(v, matrix);
      if (preview) this.drawPreview(v, matrix);
    }
  }

  private context(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return ctx;
  }

  private drawImage(v: Viewport, matrix: number[], image: Size) {
    const ctx = this.context(v.rgb);
    if (!ctx || !v.image || !v.image.complete) return;
    ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    ctx.drawImage(v.image, 0, 0, image.width, image.height);
  }

  private updateOffscreen(rect: DirtyRect | 'all') {
    const doc = this.doc;
    if (!doc) {
      this.offscreen = null;
      return;
    }
    if (!this.offscreen || this.offscreen.width !== doc.width || this.offscreen.height !== doc.height) {
      this.offscreen = document.createElement('canvas');
      this.offscreen.width = doc.width;
      this.offscreen.height = doc.height;
      rect = 'all';
    }
    const r = rect === 'all' ? { x: 0, y: 0, width: doc.width, height: doc.height } : rect;
    const ctx = this.offscreen.getContext('2d');
    if (!ctx || r.width <= 0 || r.height <= 0) return;
    const { maskType, classes } = useSegmentationStore.getState();
    const data = ctx.createImageData(r.width, r.height);
    renderMaskRect(doc, maskType, classes, r, data.data);
    ctx.putImageData(data, r.x, r.y);
  }

  private drawMask(v: Viewport, matrix: number[]) {
    const ctx = this.context(v.mask);
    const area = useSegmentationStore.getState().maskArea;
    if (!ctx || !this.offscreen || !area) return;
    ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    ctx.drawImage(this.offscreen, area[0], area[1]);
  }

  private drawPreview(v: Viewport, matrix: number[]) {
    const ctx = this.context(v.preview);
    if (!ctx) return;
    const s = useSegmentationStore.getState();
    ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);

    // Brush outline at the cursor
    const offset = brushOffset(s.toolSize);
    const x = this.cursor[0] + offset;
    const y = this.cursor[1] + offset;
    ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
    if (s.toolShape === 'round') {
      const radius = s.toolSize / 2;
      ctx.beginPath();
      ctx.arc(x + radius, y + radius, radius, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      ctx.fillRect(x, y, s.toolSize, s.toolSize);
    }

    // Boundary of the area that can be annotated
    if (s.maskArea && s.maskDimensions) {
      const viewCount = Object.keys(useSegmentationStore.getState().views).length;
      ctx.beginPath();
      ctx.lineWidth = viewCount < 2 ? 3 : 2;
      ctx.strokeStyle = 'red';
      ctx.setLineDash([5, 15]);
      ctx.rect(s.maskArea[0], s.maskArea[1], s.maskDimensions.width, s.maskDimensions.height);
      ctx.stroke();
    }
  }

  private applyFilters() {
    const { brightness, saturation, contrast, invert } = useSegmentationStore.getState();
    const parts: string[] = [];
    if (invert) parts.push('invert(1)');
    parts.push(`brightness(${brightness}%)`);
    if (contrast) parts.push('contrast(200%)');
    parts.push(`saturate(${saturation}%)`);
    const filter = parts.join(' ');
    this.viewports.forEach(v => { v.rgb.style.filter = filter; });
  }

  private applyMaskVisibility() {
    const show = useSegmentationStore.getState().showMask;
    this.viewports.forEach(v => { v.mask.style.display = show ? 'block' : 'none'; });
    if (show) this.invalidate({ mask: true });
  }
}

/** The controller for the segmentation page. */
export const canvasController = new CanvasController();
