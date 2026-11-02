/**
 * Brush footprints: which mask pixels a single brush stamp covers.
 *
 * Ported from the legacy user_draws_on_mask so that brush shapes stay
 * exactly as users know them, including the hand-made cross (size 3) and
 * diamond (size 5) round brushes and the off-centre even-sized circles.
 * The one deliberate difference: the legacy code clamped the stamp to
 * `maskSize - 1` against an exclusive bound, so the last column and last
 * row of the mask could never be painted. Here they can.
 */

export type BrushShape = 'square' | 'round';

/** [x0, y0, x1, y1] of the mask inside the image, in image pixels. */
export type MaskArea = [number, number, number, number];

export interface Size {
  width: number;
  height: number;
}

/** Axis-aligned rectangle in image coordinates. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BrushStamp {
  shape: BrushShape;
  size: number;
  /** Cursor position in image pixels (integers). */
  cursor: [number, number];
  maskArea: MaskArea;
  maskSize: Size;
  /** Part of the image visible on the canvas; the stamp is clipped to it. */
  visible: Rect;
}

/** Legacy round_number: `(x + .5) | 0`, which truncates towards zero. */
export function roundHalfUp(x: number): number {
  return (x + 0.5) | 0;
}

/** Offset of the stamp's top-left corner from the cursor. */
export function brushOffset(size: number): number {
  return size === 1 ? 0 : roundHalfUp(-size / 2);
}

const CROSS: Array<[number, number]> = [
  [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
];

const DIAMOND: Array<[number, number]> = [
  [0, 0],
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
  [-2, 0], [2, 0], [0, -2], [0, 2],
];

/**
 * Mask indices (`y * width + x`) covered by one stamp, in no particular
 * order and without duplicates.
 */
export function brushPixels(stamp: BrushStamp): number[] {
  const { shape, size, cursor, maskArea, maskSize, visible } = stamp;
  const { width, height } = maskSize;
  const offset = brushOffset(size);

  // Stamp bounds in image coordinates, clipped to the visible canvas area
  let xStart = Math.max(roundHalfUp(visible.x0), cursor[0] + offset);
  let xEnd = Math.min(roundHalfUp(visible.x1), cursor[0] + offset + size);
  let yStart = Math.max(roundHalfUp(visible.y0), cursor[1] + offset);
  let yEnd = Math.min(roundHalfUp(visible.y1), cursor[1] + offset + size);

  // Into mask coordinates, clipped to the mask
  xStart = Math.max(0, xStart - maskArea[0]);
  xEnd = Math.min(width, xEnd - maskArea[0]);
  yStart = Math.max(0, yStart - maskArea[1]);
  yEnd = Math.min(height, yEnd - maskArea[1]);

  const out: number[] = [];
  const inMask = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height;
  const inStamp = (x: number, y: number) => x >= xStart && x < xEnd && y >= yStart && y < yEnd;

  if (shape === 'round' && size === 1) {
    // The legacy 1-pixel brush ignores the (possibly empty) stamp bounds
    if (inMask(xStart, yStart)) out.push(yStart * width + xStart);
    return out;
  }

  if (shape === 'round' && (size === 3 || size === 5)) {
    const cx = Math.floor((xStart + xEnd) / 2);
    const cy = Math.floor((yStart + yEnd) / 2);
    for (const [dx, dy] of size === 3 ? CROSS : DIAMOND) {
      const x = cx + dx;
      const y = cy + dy;
      if (inStamp(x, y) && inMask(x, y)) out.push(y * width + x);
    }
    return out;
  }

  if (shape === 'round') {
    const centreX = cursor[0] + offset + size / 2;
    const centreY = cursor[1] + offset + size / 2;
    const radius = size / 2;
    for (let x = xStart; x < xEnd; x++) {
      for (let y = yStart; y < yEnd; y++) {
        const dx = x + maskArea[0] - centreX;
        const dy = y + maskArea[1] - centreY;
        if (Math.sqrt(dx * dx + dy * dy) <= radius && inMask(x, y)) {
          out.push(y * width + x);
        }
      }
    }
    return out;
  }

  for (let x = xStart; x < xEnd; x++) {
    for (let y = yStart; y < yEnd; y++) {
      if (inMask(x, y)) out.push(y * width + x);
    }
  }
  return out;
}

/**
 * Integer points from `from` to `to` inclusive (Bresenham), for stamping
 * along a pointer movement so fast strokes have no gaps.
 */
export function strokePoints(from: [number, number], to: [number, number]): Array<[number, number]> {
  let [x0, y0] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const points: Array<[number, number]> = [];
  for (;;) {
    points.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return points;
}
