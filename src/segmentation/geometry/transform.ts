/**
 * Zoom and pan for the view canvases, in image-space terms.
 *
 * Every view canvas shows the same part of the image. A ViewTransform says
 * which part, independently of canvas size:
 *
 *   zoom    - magnification relative to the fit-to-canvas scale
 *   originX - image x coordinate shown at the canvas's left edge
 *   originY - image y coordinate shown at the canvas's top edge
 *
 * The behaviour matches the legacy canvas-matrix code (zoom about the
 * cursor, then constrain_view): zooming never goes below the fit scale and
 * the image always covers the canvas.
 */

import type { Rect, Size } from './brush';

export interface ViewTransform {
  zoom: number;
  originX: number;
  originY: number;
}

export const FIT: ViewTransform = Object.freeze({ zoom: 1, originX: 0, originY: 0 });

/** Treat a missing transform as the default fit view. */
export function orFit(t: ViewTransform | null | undefined): ViewTransform {
  return t ?? FIT;
}

/** Whether a transform is (within rounding) the default fit view. */
export function isFit(t: ViewTransform | null | undefined): boolean {
  if (!t) return true;
  return Math.abs(t.zoom - 1) < 1e-6 && Math.abs(t.originX) < 1e-6 && Math.abs(t.originY) < 1e-6;
}

/** Canvas pixels per image pixel, per axis. */
export function pixelScale(t: ViewTransform, canvas: Size, image: Size): { x: number; y: number } {
  return {
    x: (canvas.width / image.width) * t.zoom,
    y: (canvas.height / image.height) * t.zoom,
  };
}

/** The 2D context matrix [a, b, c, d, e, f] that draws image pixels onto the canvas. */
export function toMatrix(t: ViewTransform, canvas: Size, image: Size): [number, number, number, number, number, number] {
  const s = pixelScale(t, canvas, image);
  return [s.x, 0, 0, s.y, -t.originX * s.x, -t.originY * s.y];
}

export function canvasToImage(t: ViewTransform, canvas: Size, image: Size, p: [number, number]): [number, number] {
  const s = pixelScale(t, canvas, image);
  return [t.originX + p[0] / s.x, t.originY + p[1] / s.y];
}

export function imageToCanvas(t: ViewTransform, canvas: Size, image: Size, p: [number, number]): [number, number] {
  const s = pixelScale(t, canvas, image);
  return [(p[0] - t.originX) * s.x, (p[1] - t.originY) * s.y];
}

/** Part of the image visible on the canvas, in image coordinates. */
export function visibleRect(t: ViewTransform, canvas: Size, image: Size): Rect {
  const [x0, y0] = canvasToImage(t, canvas, image, [0, 0]);
  const [x1, y1] = canvasToImage(t, canvas, image, [canvas.width, canvas.height]);
  return { x0, y0, x1, y1 };
}

/** Keep the image covering the canvas: no gaps at any edge. */
export function clampToImage(t: ViewTransform, image: Size): ViewTransform {
  const maxX = image.width - image.width / t.zoom;
  const maxY = image.height - image.height / t.zoom;
  return {
    zoom: t.zoom,
    originX: Math.min(Math.max(t.originX, 0), maxX),
    originY: Math.min(Math.max(t.originY, 0), maxY),
  };
}

/**
 * Zoom by `factor` keeping the image point `at` fixed on screen.
 *
 * As in the legacy constrain_view, a zoom-out that would bring the scale
 * within one more step of the fit scale (zoom * factor < 1) snaps back to
 * the fit view.
 */
export function zoomAt(t: ViewTransform, image: Size, factor: number, at: [number, number]): ViewTransform {
  const zoom = t.zoom * factor;
  if (zoom * factor < 1) return { ...FIT };
  return clampToImage({
    zoom,
    originX: at[0] + (t.originX - at[0]) / factor,
    originY: at[1] + (t.originY - at[1]) / factor,
  }, image);
}

/** Move the image by (dx, dy) image pixels, as dragging it does. */
export function panBy(t: ViewTransform, image: Size, dx: number, dy: number): ViewTransform {
  if (t.zoom < 1) return { ...FIT };
  return clampToImage({ zoom: t.zoom, originX: t.originX - dx, originY: t.originY - dy }, image);
}

/** Legacy round_number: `(x + .5) | 0`. */
const roundHalfUp = (x: number) => (x + 0.5) | 0;

/**
 * Canvas pixel under a pointer event, as the legacy update_cursor_coords
 * computed it: client position scaled from CSS pixels to canvas pixels.
 */
export function clientToCanvasPixel(
  client: [number, number],
  rect: { left: number; top: number; width: number; height: number },
  canvas: Size,
): [number, number] {
  return [
    roundHalfUp(((client[0] - rect.left) / rect.width) * canvas.width),
    roundHalfUp(((client[1] - rect.top) / rect.height) * canvas.height),
  ];
}

/** Image pixel under a canvas pixel, rounded as the legacy cursor was. */
export function canvasPixelToImagePixel(t: ViewTransform, canvas: Size, image: Size, p: [number, number]): [number, number] {
  const [x, y] = canvasToImage(t, canvas, image, p);
  return [roundHalfUp(x), roundHalfUp(y)];
}
